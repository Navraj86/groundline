# Configuration lives in SSM Parameter Store (standard parameters are free). deploy.sh on
# the instance turns it into the containers' .env file on every deploy.
#
#   <path>config            non-secret settings, managed here
#   <path>secrets/<NAME>    one SecureString per secret; "-" means not set yet.
#                           Generated ones are filled in; the rest you set after the first
#                           apply (docs/deploy-aws-terraform.md). Terraform never overwrites your values.

resource "aws_ssm_parameter" "config" {
  name = "${local.param_path}config"
  type = "String"
  tier = "Standard"
  value = join("\n", [
    "API_DOMAIN=${local.api_domain}",
    "ACME_EMAIL=${var.acme_email}",
    "IMAGE_REGISTRY=${var.image_registry}",
    "WEB_URL=${var.web_url}",
    "SUPABASE_AUTH_URL=${var.supabase_auth_url}",
    "MAIL_FROM=${var.mail_from}",
    "DODO_PAYMENTS_ENVIRONMENT=${var.dodo_payments_environment}",
    "ANSWER_REVIEW_SAMPLE_RATE=${var.answer_review_sample_rate}",
    # Empty endpoint and keys: the AWS SDKs use S3 and the instance role.
    "S3_ENDPOINT=",
    "S3_ACCESS_KEY=",
    "S3_SECRET_KEY=",
    "S3_REGION=${var.region}",
    "S3_BUCKET=${aws_s3_bucket.uploads.id}",
  ])
}

resource "random_password" "generated" {
  for_each = toset(["AI_SERVICE_TOKEN", "WIDGET_TOKEN_SECRET", "PROXY_SECRET"])
  length   = 48
  special  = false
}

resource "random_bytes" "encryption_key" {
  length = 32
}

locals {
  generated_secrets = merge(
    { for k, v in random_password.generated : k => v.result },
    { ENCRYPTION_KEY = random_bytes.encryption_key.base64 },
  )
  # Filled in by you; see the table in docs/deploy-aws-terraform.md.
  manual_secrets = [
    "DATABASE_URL", "MIGRATE_DATABASE_URL", "AI_DATABASE_URL",
    "SUPABASE_ANON_KEY", "SUPABASE_JWT_SECRET", "SMTP_URL",
    "OPENAI_API_KEY", "DEEPSEEK_API_KEY",
    "DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY", "DODO_PRODUCT_STARTER", "DODO_PRODUCT_GROWTH",
  ]
}

resource "aws_ssm_parameter" "generated" {
  for_each = local.generated_secrets
  name     = "${local.param_path}secrets/${each.key}"
  type     = "SecureString"
  tier     = "Standard"
  value    = each.value
  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "manual" {
  for_each = toset(local.manual_secrets)
  name     = "${local.param_path}secrets/${each.key}"
  type     = "SecureString"
  tier     = "Standard"
  value    = "-"
  lifecycle {
    ignore_changes = [value]
  }
}
