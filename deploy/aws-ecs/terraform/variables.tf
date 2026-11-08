variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name, used in resource names (e.g. prod, staging)."
  type        = string
  default     = "prod"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "Use 2-16 lowercase letters, digits or hyphens."
  }
}

variable "image_tag" {
  description = "Image tag to run for web, api, worker, ai and migrate: the commit SHA the images were built from."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]{1,128}$", var.image_tag))
    error_message = "Use the tag the images were pushed with, e.g. a commit SHA."
  }
}

# ---- Domain and HTTPS ---------------------------------------------------------------

variable "domain_name" {
  description = "Public hostname for the app, e.g. support.example.com. Leave empty to use the load balancer's DNS name over HTTP (testing only)."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone for domain_name. When set, the certificate is validated and the DNS record created automatically."
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "Existing ACM certificate for domain_name, if you manage DNS outside Route 53. Leave empty to have one issued (requires route53_zone_id)."
  type        = string
  default     = ""
}

# ---- Sizing ---------------------------------------------------------------------------

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "single_nat_gateway" {
  description = "One NAT gateway for all private subnets (cheaper) instead of one per availability zone (more resilient)."
  type        = bool
  default     = true
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "db_allocated_storage" {
  description = "Initial storage in GB; grows automatically up to 5x."
  type        = number
  default     = 20
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "services" {
  description = "CPU (units), memory (MiB) and task counts per service."
  type = map(object({
    cpu           = number
    memory        = number
    desired_count = number
    max_count     = number
  }))
  default = {
    web    = { cpu = 512, memory = 1024, desired_count = 2, max_count = 6 }
    api    = { cpu = 512, memory = 1024, desired_count = 2, max_count = 6 }
    worker = { cpu = 256, memory = 512, desired_count = 1, max_count = 4 }
    ai     = { cpu = 1024, memory = 2048, desired_count = 1, max_count = 4 }
  }
}

# ---- Application settings (non-secret) ---------------------------------------------

variable "supabase_auth_url" {
  description = "Supabase Auth URL of your Supabase project: https://<ref>.supabase.co/auth/v1"
  type        = string
}

variable "mail_from" {
  type    = string
  default = "Groundline <no-reply@example.com>"
}

variable "dodo_payments_environment" {
  type    = string
  default = "test_mode"

  validation {
    condition     = contains(["test_mode", "live_mode"], var.dodo_payments_environment)
    error_message = "Use test_mode or live_mode."
  }
}

variable "answer_review_sample_rate" {
  type    = number
  default = 0.25
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "alarm_email" {
  description = "Email address for CloudWatch alarm notifications. Leave empty for no notifications."
  type        = string
  default     = ""
}

# ---- CI/CD ------------------------------------------------------------------------

variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to deploy through OIDC, e.g. Navraj86/groundline. Leave empty to skip the deploy role."
  type        = string
  default     = ""
}

variable "github_deploy_branch" {
  type    = string
  default = "main"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC identity provider. Set false if your account already has one."
  type        = bool
  default     = true
}
