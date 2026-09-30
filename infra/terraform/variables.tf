variable "subscription_id" {
  type        = string
  description = "Azure subscription ID."
}

variable "location" {
  type        = string
  description = "Azure region for all resources."
  default     = "eastasia"
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
  description = "Node VM size. Standard_B2ls_v2 is the smallest practical size for this app in this subscription."
  default     = "Standard_B2ls_v2"
}
