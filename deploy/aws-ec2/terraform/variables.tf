variable "region" {
  description = "AWS region. Pick one close to your Supabase project's region."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  type    = string
  default = "prod"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "Use 2-16 lowercase letters, digits or hyphens."
  }
}

variable "instance_type" {
  description = "Graviton (arm64) instance. t4g.small (2 vCPU, 2 GB) fits the API, worker, AI service and Redis."
  type        = string
  default     = "t4g.small"

  validation {
    condition     = can(regex("^(t4g|m7g|c7g|r7g|m8g|c8g)\\.", var.instance_type))
    error_message = "Use a Graviton (arm64) instance type; the images and AMI are arm64."
  }
}

variable "root_volume_gb" {
  type    = number
  default = 20
}

variable "api_domain" {
  description = "Hostname for the API, e.g. api.example.com (point an A record at the elastic IP). Leave empty to use a free <ip>.sslip.io name."
  type        = string
  default     = ""
}

variable "acme_email" {
  description = "Email for Let's Encrypt certificate notices."
  type        = string
}

variable "web_url" {
  description = "Public URL of the web app on Vercel, e.g. https://groundline.vercel.app"
  type        = string
}

variable "supabase_auth_url" {
  description = "https://<project-ref>.supabase.co/auth/v1"
  type        = string
}

variable "mail_from" {
  type    = string
  default = "Groundline <no-reply@example.com>"
}

variable "dodo_payments_environment" {
  type    = string
  default = "test_mode"
}

variable "answer_review_sample_rate" {
  description = "Share of answers checked in the background; each check is one model call."
  type        = number
  default     = 0.1
}

variable "image_registry" {
  description = "Where the images are pulled from. GHCR is free for public images."
  type        = string
  default     = "ghcr.io/navraj86/groundline"
}

variable "repository" {
  description = "GitHub repository (owner/name) the deploy script and compose files are fetched from."
  type        = string
  default     = "Navraj86/groundline"
}

variable "github_deploy" {
  description = "Create the OIDC role GitHub Actions uses to deploy."
  type        = bool
  default     = true
}

variable "create_github_oidc_provider" {
  description = "Set false if the account already has the GitHub OIDC identity provider."
  type        = bool
  default     = true
}

variable "monthly_budget_usd" {
  description = "Email alerts when this month's AWS spend is forecast to pass this amount."
  type        = number
  default     = 25
}

variable "alert_email" {
  description = "Receives budget and alarm notifications."
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 14
}
