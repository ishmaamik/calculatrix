# Deploy Calculatris to Azure AKS with Terraform

> **Lowest-cost learning setup:** this guide uses the AKS Free tier, one small
> burstable node, and ACR Basic. Do not leave the cluster running when you are
> not using it. Azure prices vary by region, subscription, and date; check the
> Azure pricing calculator before applying Terraform.

> **For a $100 Azure for Students credit:** create a budget alert before
> deploying, use AKS only for short tests, and destroy the resource group when
> finished. A budget alert notifies you but does not automatically stop or
> delete resources.

This guide deploys the current repository as two containers:

```text
Browser
  -> frontend-service (public Azure LoadBalancer)
  -> frontend (Next.js, port 3000)
  -> backend-service (private ClusterIP)
  -> backend (Express, port 8080)
```

The browser never calls Express directly. The Next.js route at
`frontend/src/app/api/calculate/route.ts` calls `BACKEND_URL`, so the backend
service stays private inside Kubernetes.

The commands below use Linux/macOS shell syntax. Run them from the repository
root unless a command says otherwise.

## 1. What you need

You need:

- An Azure account with permission to create resource groups, AKS clusters, ACRs,
  role assignments, and public IPs.
- A subscription with a payment method. AKS and its virtual machines are not
  permanently free.
- Docker Desktop or Docker Engine running locally.
- Azure CLI (`az`), Terraform, `kubectl`, and Git.

Install the command-line tools using the official instructions:

- Azure CLI: <https://learn.microsoft.com/cli/azure/install-azure-cli>
- Terraform: <https://developer.hashicorp.com/terraform/install>
- kubectl: `az aks install-cli`
- Docker: <https://docs.docker.com/engine/install/>

Check that they are available:

```bash
az version
terraform version
kubectl version --client
docker version
```

## 2. Set your Azure variables

Choose globally unique names for the resource group and ACR. ACR names may
contain only lowercase letters and numbers. The Azure region must support the
VM size selected in Terraform.

```bash
export LOCATION=eastus
export RESOURCE_GROUP=calculatris-rg
export ACR_NAME=calculatrisacr$RANDOM
export AKS_NAME=calculatris-aks
export CLUSTER_NAMESPACE=calculatris
export IMAGE_TAG=$(git rev-parse --short HEAD)

echo "ACR name: $ACR_NAME"
echo "Image tag: $IMAGE_TAG"
```

If you use a new terminal later, export these variables again or put them in a
local shell file that is not committed to Git.

## 3. Sign in and choose the subscription

First, sign in. A browser window will open:

```bash
az login
az account list --output table
```

Copy the subscription ID you intend to use, then set it:

```bash
export SUBSCRIPTION_ID="replace-with-your-subscription-id"
az account set --subscription "$SUBSCRIPTION_ID"
az account show --output table
```

Every Azure resource in this guide is created in this subscription.

### Set a spending alert before creating resources

In the Azure Portal, open **Cost Management + Billing**, select your student
subscription, then open **Budgets** and choose **Add**. Create a monthly budget
well below your $100 credit, such as `$25`, and add alert thresholds at 50%,
80%, and 100%. Use an email address you check. This is only an alarm; it cannot
protect the credit by itself.

For this small credit balance, do not create the AKS cluster until the budget
exists. Also check **Cost analysis** regularly and filter by resource group
`calculatris-rg`.

## 4. Create the Azure infrastructure with Terraform

There is no Terraform in the current repository yet. Create a local directory
for it:

```bash
mkdir -p infra/terraform
cd infra/terraform
```

Create `main.tf` with this content:

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_container_registry" "this" {
  name                = var.acr_name
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "Basic"
  admin_enabled       = false
}

resource "azurerm_kubernetes_cluster" "this" {
  name                = var.aks_name
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  dns_prefix          = var.aks_name
  sku_tier            = "Free"

  default_node_pool {
    name       = "system"
    node_count = 1
    vm_size    = var.vm_size
  }

  identity {
    type = "SystemAssigned"
  }

  tags = {
    application = "calculatris"
    managed_by  = "terraform"
  }
}

# This lets AKS pull private images from ACR without a registry password.
resource "azurerm_role_assignment" "aks_acr_pull" {
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.this.kubelet_identity[0].object_id
}
```

Create `variables.tf`:

```hcl
variable "subscription_id" {
  type        = string
  description = "Azure subscription ID."
}

variable "location" {
  type        = string
  description = "Azure region for all resources."
  default     = "eastus"
}

variable "resource_group_name" {
  type        = string
  description = "Resource group name."
  default     = "calculatris-rg"
}

variable "acr_name" {
  type        = string
  description = "Globally unique lowercase ACR name."
}

variable "aks_name" {
  type        = string
  description = "AKS cluster name."
  default     = "calculatris-aks"
}

variable "vm_size" {
  type        = string
  description = "Node VM size. Increase this if the Next.js build or cluster needs more capacity."
  default     = "Standard_B2s"
}
```

Create `outputs.tf`:

```hcl
output "acr_login_server" {
  value = azurerm_container_registry.this.login_server
}

output "aks_name" {
  value = azurerm_kubernetes_cluster.this.name
}

output "resource_group_name" {
  value = azurerm_resource_group.this.name
}
```

Create `terraform.tfvars` locally. Do not commit this file if it contains
subscription or environment-specific values:

```hcl
subscription_id     = "replace-with-your-subscription-id"
location            = "eastus"
resource_group_name = "calculatris-rg"
acr_name            = "replace-with-your-lowercase-unique-acr-name"
aks_name            = "calculatris-aks"
vm_size             = "Standard_B2s"
```

Add this to `infra/terraform/.gitignore`:

```gitignore
.terraform/
*.tfstate
*.tfstate.*
crash.log
terraform.tfvars
```

Initialize and inspect the plan:

```bash
terraform init
terraform fmt
terraform validate
terraform plan
```

Read the plan. It should create one resource group, one ACR, one AKS cluster,
and one ACR pull role assignment. It deliberately does not create a Log
Analytics workspace: monitoring ingestion can consume Azure credits. For this
learning deployment, use `kubectl logs` instead. Apply it:

```bash
terraform apply
```

Type `yes` when Terraform asks for confirmation. A small AKS cluster can take
several minutes to create.

Show the values Terraform created:

```bash
terraform output
export ACR_LOGIN_SERVER=$(terraform output -raw acr_login_server)
```

### Terraform state for a real team

For a first personal test, local state is enough. Before shared or production
work, put state in an Azure Storage Account with blob locking. Bootstrap the
storage account once, then add an `azurerm` backend to `terraform` and run
`terraform init -migrate-state`. Never commit `.tfstate`; it can contain
resource details and sensitive values.

## 5. Connect kubectl to AKS

Change back to the repository root, then fetch the cluster credentials:

```bash
cd ../..
az aks get-credentials \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AKS_NAME" \
  --overwrite-existing

kubectl get nodes
```

You should see at least one node with status `Ready`. If `kubectl` reports a
wrong cluster, inspect the active context:

```bash
kubectl config current-context
kubectl config get-contexts
```

## 6. Build and push the two images to ACR

AKS cannot use images that exist only on your laptop. Log Docker into the ACR:

```bash
az acr login --name "$ACR_NAME"
```

Build from the correct contexts. The frontend Dockerfile runs `npm run build`
inside the image, and the backend image contains the Express server:

```bash
docker build \
  --tag "$ACR_LOGIN_SERVER/calculatris-backend:$IMAGE_TAG" \
  ./backend

docker build \
  --tag "$ACR_LOGIN_SERVER/calculatris-frontend:$IMAGE_TAG" \
  ./frontend
```

Push both images:

```bash
docker push "$ACR_LOGIN_SERVER/calculatris-backend:$IMAGE_TAG"
docker push "$ACR_LOGIN_SERVER/calculatris-frontend:$IMAGE_TAG"
```

Confirm that ACR has them:

```bash
az acr repository list --name "$ACR_NAME" --output table
az acr repository show-tags --name "$ACR_NAME" --repository calculatris-backend --output table
az acr repository show-tags --name "$ACR_NAME" --repository calculatris-frontend --output table
```

Use a new tag for every release. Do not reuse `latest`: Kubernetes may keep an
older image when `imagePullPolicy: IfNotPresent` is used.

## 7. Deploy the Kubernetes resources

Create a namespace so this application is separated from other workloads:

```bash
kubectl create namespace "$CLUSTER_NAMESPACE"
```

The existing backend manifests provide a private `ClusterIP` service, which is
correct for this architecture. Apply the backend resources:

```bash
kubectl -n "$CLUSTER_NAMESPACE" create secret generic backend-secret \
  --from-literal=APP_SECRET="$(openssl rand -hex 32)"

kubectl apply -n "$CLUSTER_NAMESPACE" \
  -f backend/k8s/configMap.yml \
  -f backend/k8s/backend-deployment.yml \
  -f backend/k8s/backend-service.yml
```

The checked-in secret is only a placeholder. For this current application,
`APP_SECRET` is not read anywhere, but the Deployment references the Secret.
Create a real secret from the command above without committing it. If the
secret already exists, use `kubectl -n "$CLUSTER_NAMESPACE" delete secret
backend-secret` first, then create it again.

```bash
kubectl -n "$CLUSTER_NAMESPACE" get secret backend-secret
```

Never use `replace-with-a-real-secret` in an actual environment. For a
production setup, deliver this value from Azure Key Vault as described below.

Apply the frontend resources:

```bash
kubectl apply -n "$CLUSTER_NAMESPACE" \
  -f frontend/k8s/configMap.yml \
  -f frontend/k8s/frontend-deployment.yml \
  -f frontend/k8s/frontend-service.yml
```

The frontend ConfigMap must set:

```text
BACKEND_URL=http://backend-service:8080
```

That service name works because both workloads are in the same namespace.

Now point the deployments at the images you pushed. This avoids editing local
image names into every manifest by hand:

```bash
kubectl -n "$CLUSTER_NAMESPACE" set image deployment/backend-deployment \
  backend="$ACR_LOGIN_SERVER/calculatris-backend:$IMAGE_TAG"

kubectl -n "$CLUSTER_NAMESPACE" set image deployment/frontend-deployment \
  frontend="$ACR_LOGIN_SERVER/calculatris-frontend:$IMAGE_TAG"
```

The existing frontend service is a `NodePort` for local Kind. For a simple
first AKS deployment, change it to an Azure public LoadBalancer:

```bash
kubectl -n "$CLUSTER_NAMESPACE" patch service frontend-service \
  --type merge \
  --patch '{"spec":{"type":"LoadBalancer"}}'
```

Wait for both rollouts:

```bash
kubectl -n "$CLUSTER_NAMESPACE" rollout status deployment/backend-deployment
kubectl -n "$CLUSTER_NAMESPACE" rollout status deployment/frontend-deployment
kubectl -n "$CLUSTER_NAMESPACE" get pods,svc
```

## 8. Open the application

Get the public IP assigned by Azure:

```bash
kubectl -n "$CLUSTER_NAMESPACE" get service frontend-service \
  --watch
```

Stop watching with `Ctrl+C` once `EXTERNAL-IP` is an address rather than
`<pending>`, then save it:

```bash
export FRONTEND_IP=$(kubectl -n "$CLUSTER_NAMESPACE" \
  get service frontend-service \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

echo "Open http://$FRONTEND_IP"
```

Open that URL in a browser. Enter two numbers, choose an operation, and press
Calculate. The request path is:

```text
Browser POST /api/calculate
Next.js POST http://backend-service:8080/calculate
Express JSON response
Next.js returns the response to the browser
```

## 9. Verify each layer when something fails

### Pods and events

```bash
kubectl -n "$CLUSTER_NAMESPACE" get pods -o wide
kubectl -n "$CLUSTER_NAMESPACE" get events --sort-by=.lastTimestamp
```

### Container logs

```bash
kubectl -n "$CLUSTER_NAMESPACE" logs deployment/backend-deployment
kubectl -n "$CLUSTER_NAMESPACE" logs deployment/frontend-deployment
```

### Image pull failures

If a pod says `ImagePullBackOff` or `ErrImagePull`, check the exact image and
the AKS-to-ACR permission:

```bash
kubectl -n "$CLUSTER_NAMESPACE" describe pod \
  "$(kubectl -n "$CLUSTER_NAMESPACE" get pods \
  -l app=backend -o jsonpath='{.items[0].metadata.name}')"

az aks check-acr \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AKS_NAME" \
  --acr "$ACR_NAME"
```

### Frontend cannot reach the backend

Check the ConfigMap and service endpoints:

```bash
kubectl -n "$CLUSTER_NAMESPACE" get configmap frontend-config -o yaml
kubectl -n "$CLUSTER_NAMESPACE" get service backend-service
kubectl -n "$CLUSTER_NAMESPACE" get endpoints backend-service
```

An empty endpoint list usually means the backend pod is not Ready or the
service selector does not match the backend pod labels.

### Frontend has no public IP

```bash
kubectl -n "$CLUSTER_NAMESPACE" describe service frontend-service
```

Look at the events at the bottom. Also check the Azure resource group created
for the AKS node infrastructure in the Azure Portal. LoadBalancer provisioning
can take a few minutes.

### Test the backend without exposing it

Use a temporary port-forward from your machine:

```bash
kubectl -n "$CLUSTER_NAMESPACE" port-forward \
  service/backend-service 8080:8080
```

In another terminal:

```bash
curl -i -X POST http://127.0.0.1:8080/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","firstNumber":2,"secondNumber":3}'
```

Expected JSON includes `"result":5`. Stop the port-forward with `Ctrl+C`.

## 10. Azure Portal navigation

The CLI is the repeatable deployment path, but the portal is useful for
observing the result:

1. Open <https://portal.azure.com>.
2. Search for **Resource groups**, then open `calculatris-rg`.
3. Open the **Kubernetes service** to see AKS overview, nodes, workloads, and
   monitoring.
4. Open the **Container registry** to see image repositories and tags.
5. In AKS, select **Kubernetes resources** to inspect workloads, services, and
   ingresses. The frontend public IP is shown on the `frontend-service` service.
6. Use `kubectl logs` from the terminal to inspect containers. This low-cost
  setup does not enable the paid Log Analytics container monitoring agent.

## 11. Updating the application

For each code change:

```bash
export IMAGE_TAG=$(git rev-parse --short HEAD)

docker build -t "$ACR_LOGIN_SERVER/calculatris-backend:$IMAGE_TAG" ./backend
docker build -t "$ACR_LOGIN_SERVER/calculatris-frontend:$IMAGE_TAG" ./frontend
docker push "$ACR_LOGIN_SERVER/calculatris-backend:$IMAGE_TAG"
docker push "$ACR_LOGIN_SERVER/calculatris-frontend:$IMAGE_TAG"

kubectl -n "$CLUSTER_NAMESPACE" set image deployment/backend-deployment \
  backend="$ACR_LOGIN_SERVER/calculatris-backend:$IMAGE_TAG"
kubectl -n "$CLUSTER_NAMESPACE" set image deployment/frontend-deployment \
  frontend="$ACR_LOGIN_SERVER/calculatris-frontend:$IMAGE_TAG"

kubectl -n "$CLUSTER_NAMESPACE" rollout status deployment/backend-deployment
kubectl -n "$CLUSTER_NAMESPACE" rollout status deployment/frontend-deployment
```

Rollback the last deployment if necessary:

```bash
kubectl -n "$CLUSTER_NAMESPACE" rollout undo deployment/backend-deployment
kubectl -n "$CLUSTER_NAMESPACE" rollout undo deployment/frontend-deployment
```

## 12. Stop paying for the test environment

Destroying the resource group removes the AKS cluster, ACR, workspace, and
public resources created by this guide:

```bash
cd infra/terraform
terraform destroy
```

Confirm the destruction carefully. Do not run this against a resource group
that contains anything else.

With a $100 student credit, the safest end-of-session routine is:

```bash
kubectl -n "$CLUSTER_NAMESPACE" get pods,svc
terraform destroy
```

Do not rely only on closing your laptop or deleting Kubernetes pods. The Azure
node and other Azure resources continue billing until the infrastructure is
stopped or destroyed. After `terraform destroy`, verify in the portal that the
resource group is gone and check **Cost analysis** for any remaining charges.

### Cheapest option while keeping the environment

If you need to keep the cluster for a short period but are not using it, stop
the AKS cluster. Stopped clusters do not run node VMs, but the ACR and other
resources may still have charges:

```bash
az aks stop \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AKS_NAME"
```

Start it again before using `kubectl`:

```bash
az aks start \
  --resource-group "$RESOURCE_GROUP" \
  --name "$AKS_NAME"
```

For the lowest possible cost, run `terraform destroy` when finished and create
the environment again when needed. A stopped cluster is not a replacement for
destroying resources you no longer need.

## 13. Important improvements before production

The current repository is a good small demo, but the existing manifests are
not a complete production platform. Before putting real users on it:

- Add backend `/healthz` and `/readyz` endpoints, then configure liveness and
  readiness probes.
- Add CPU/memory requests and limits, at least two replicas, and a Pod
  Disruption Budget.
- Add a real Ingress controller with DNS and HTTPS/TLS instead of exposing a
  service directly with a public LoadBalancer.
- Replace the placeholder Kubernetes secret with Azure Key Vault plus the
  Secrets Store CSI Driver and Workload Identity. The current app does not
  consume `APP_SECRET`, so remove it until a feature needs it.
- Add automated backend tests. The current `backend` `test` script intentionally
  exits with status 1 because no tests exist yet.
- Add a backend `.dockerignore`; the current backend Dockerfile uses `COPY . .`
  and should not be allowed to copy local environment files into an image.
- Use `npm ci` in the backend Dockerfile for reproducible installs, matching
  the frontend image.
- Add CI/CD to build, scan, push, and deploy immutable image tags after tests.
- Add network policies, Azure Policy, Defender for Containers, alerts, and
  private cluster/networking requirements if this becomes a business service.

## 14. Current files and what they mean

- `backend/Dockerfile`: builds the Express API on port 8080.
- `frontend/Dockerfile`: builds and starts Next.js on port 3000.
- `backend/k8s/*`: backend ConfigMap, Deployment, Service, and placeholder
  Secret.
- `frontend/k8s/*`: frontend ConfigMap, Deployment, public-service candidate,
  and local Kind configuration.
- `frontend/k8s/kind-config.yml`: local Kind port mapping; it is not needed by
  AKS.
- `docker-compose.yml`: local Docker validation; Compose service DNS uses
  `http://backend:8080`, while AKS uses `http://backend-service:8080`.

Do not apply the Kind configuration to AKS. Do not expect the local image names
`calculator-backend:latest` and `calculator-frontend:latest` to exist in AKS;
the ACR image tags and `kubectl set image` commands above are the AKS path.