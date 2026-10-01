# Calculatris

Calculatris is a small full-stack calculator that I used to practise taking an application from local development to a real cloud deployment.

The frontend is built with Next.js and React. The API is an Express service. Both parts run in Docker containers and Kubernetes. For the Azure deployment, Terraform creates the AKS cluster and Azure Container Registry, while Kubernetes manages the application workloads.

## How it works

The browser talks to the Next.js route at `/api/calculate`. Next.js forwards the request to the private Express service. In Kubernetes, the backend is a `ClusterIP` service, so it is reachable from inside the cluster but is not exposed directly to the internet. Only the frontend uses a public Azure LoadBalancer.

```text
Browser
  -> Next.js frontend :3000
  -> /api/calculate
  -> backend-service :8080
  -> Express calculator API
```

The API supports addition, subtraction, multiplication, and division. It validates the operation and numbers and rejects division by zero. The frontend keeps the five most recent calculations in memory.

## Stack

- Next.js, React, TypeScript
- Express.js and Node.js
- Docker and Docker Compose
- Kubernetes and Kind
- Azure Container Registry and Azure Kubernetes Service
- Terraform and Azure CLI

## Project layout

```text
backend/                  Express API, Dockerfile, and Kubernetes files
frontend/                 Next.js UI, Dockerfile, and Kubernetes files
infra/terraform/          Azure infrastructure definitions
infra/AKS_DEPLOYMENT_GUIDE.md
```

## Run locally

### Node.js

Start the API:

```bash
cd backend
npm install
npm start
```

Start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>. The frontend uses `http://localhost:8080` as its default backend URL during direct local development.

### Docker Compose

The Compose files are separate because the frontend and backend have separate build contexts.

```bash
docker compose -f backend/docker-compose.yml up --build
```

In another terminal:

```bash
docker compose -f frontend/docker-compose.yml up --build
```

Open <http://localhost:3000>. Stop either service with `Ctrl+C`.

## API example

```bash
curl -i -X POST http://127.0.0.1:8080/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","firstNumber":2,"secondNumber":3}'
```

The response includes:

```json
{"operation":"add","firstNumber":2,"secondNumber":3,"result":5}
```

## Deploy to Azure AKS

The detailed walkthrough is in [`infra/AKS_DEPLOYMENT_GUIDE.md`](infra/AKS_DEPLOYMENT_GUIDE.md). The short version is:

1. Sign in with Azure CLI and select the correct subscription.
2. Create a budget alert before provisioning anything.
3. Run Terraform from `infra/terraform` to create the resource group, Basic ACR, AKS Free-tier cluster, and `AcrPull` role assignment.
4. Get AKS credentials with `az aks get-credentials`.
5. Build and push versioned backend and frontend images to ACR.
6. Apply the Kubernetes ConfigMaps, Secrets, Deployments, and Services.
7. Change `frontend-service` to an Azure `LoadBalancer` and open its external IP on port `3000`.

The tested student-subscription setup used `eastasia` and one `Standard_B2ls_v2` node because the subscription restricted other regions and VM SKUs. These values are defaults in the Terraform variables, but Azure availability can differ between subscriptions.

### Terraform commands

Run these from `infra/terraform`:

```bash
export TF_VAR_subscription_id=$(az account show --query id --output tsv)
export TF_VAR_acr_name=calculatrisacr$(date +%s)

terraform init
terraform fmt
terraform validate
terraform plan -out=calculatris.tfplan
terraform apply calculatris.tfplan
```

Terraform state, variable files, and saved plans are ignored by Git. Keep the subscription ID and environment-specific registry name out of committed files.

### Build and push images

From the repository root:

```bash
export ACR_LOGIN_SERVER=$(terraform -chdir=infra/terraform output -raw acr_login_server)
export ACR_NAME=${ACR_LOGIN_SERVER%%.*}
export IMAGE_TAG=$(date +%Y%m%d%H%M%S)

az acr login --name "$ACR_NAME"

docker build -t "$ACR_LOGIN_SERVER/calculatris-backend:$IMAGE_TAG" ./backend
docker build -t "$ACR_LOGIN_SERVER/calculatris-frontend:$IMAGE_TAG" ./frontend

docker push "$ACR_LOGIN_SERVER/calculatris-backend:$IMAGE_TAG"
docker push "$ACR_LOGIN_SERVER/calculatris-frontend:$IMAGE_TAG"
```

Use a new image tag for each update rather than reusing `latest`.

### Deploy the workloads

```bash
export CLUSTER_NAMESPACE=calculatris

kubectl create namespace "$CLUSTER_NAMESPACE" --dry-run=client -o yaml \
  | kubectl apply -f -

kubectl -n "$CLUSTER_NAMESPACE" create secret generic backend-secret \
  --from-literal=APP_SECRET="$(openssl rand -hex 32)" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "$CLUSTER_NAMESPACE" create secret generic frontend-secret \
  --from-literal=APP_SECRET="$(openssl rand -hex 32)" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -n "$CLUSTER_NAMESPACE" \
  -f backend/k8s/configMap.yml \
  -f backend/k8s/backend-deployment.yml \
  -f backend/k8s/backend-service.yml

kubectl apply -n "$CLUSTER_NAMESPACE" \
  -f frontend/k8s/configMap.yml \
  -f frontend/k8s/frontend-deployment.yml \
  -f frontend/k8s/frontend-service.yml

kubectl -n "$CLUSTER_NAMESPACE" set image deployment/backend-deployment \
  backend="$ACR_LOGIN_SERVER/calculatris-backend:$IMAGE_TAG"

kubectl -n "$CLUSTER_NAMESPACE" set image deployment/frontend-deployment \
  frontend="$ACR_LOGIN_SERVER/calculatris-frontend:$IMAGE_TAG"

kubectl -n "$CLUSTER_NAMESPACE" patch service frontend-service \
  --type merge \
  --patch '{"spec":{"type":"LoadBalancer"}}'
```

Check the rollout and public address:

```bash
kubectl -n "$CLUSTER_NAMESPACE" rollout status deployment/backend-deployment
kubectl -n "$CLUSTER_NAMESPACE" rollout status deployment/frontend-deployment
kubectl -n "$CLUSTER_NAMESPACE" get pods,services
```

The frontend URL is `http://EXTERNAL-IP:3000`. The backend should remain a private `ClusterIP` service.

## Monitoring

The committed low-cost Terraform configuration does not enable the Log Analytics container agent. For this learning deployment, I used `kubectl logs`, rollout status, events, and service endpoints to inspect the application.

Azure Monitor and Log Analytics are suitable next steps for a longer-running environment. They can provide KQL queries, container logs, resource metrics, and alerts, but monitoring ingestion can consume Azure credits and should be enabled deliberately.

## Clean up Azure resources

AKS Free tier does not make the worker node free. Destroy the environment when finished:

```bash
cd infra/terraform
export TF_VAR_subscription_id=$(az account show --query id --output tsv)
export TF_VAR_acr_name=YOUR_ACR_NAME
terraform destroy
```

Review the plan and type `yes`. Verify that the resource group is gone:

```bash
az group show --name calculatris-rg --output table
```

Azure Cost Management can take time to display final usage. No new AKS, ACR, or load-balancer usage should accumulate after the resources are destroyed.

## Git history

- `456e65b` added the application, containers, Kubernetes files, and initial deployment guide.
- `72379c3` added the Terraform infrastructure, provider lock file, cost-focused ignore rules, and final AKS deployment configuration.

Repository: <https://github.com/ishmaamik/calculatrix>
