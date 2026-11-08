# Secrets are injected into containers by ECS at start; they never appear in task definitions.
#
# - "database": connection URLs built here. The RDS CA bundle ships in the images at
#   /etc/ssl/rds/global-bundle.pem, so every client verifies the server certificate.
# - "app": generated keys plus provider credentials you fill in after the first apply
#   (see docs/deploy-aws.md). Terraform never overwrites values you've changed.

locals {
  rds_ca  = "/etc/ssl/rds/global-bundle.pem"
  db_auth = "${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
}

resource "aws_secretsmanager_secret" "database" {
  name                    = "${local.name}/database"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    # node-postgres (API, worker, seed): verify-full against the CA in NODE_EXTRA_CA_CERTS.
    node = "postgresql://${local.db_auth}?sslmode=verify-full"
    # Prisma migrate (schema engine).
    prisma = "postgresql://${local.db_auth}?sslmode=require&sslaccept=strict&sslcert=${local.rds_ca}"
    # psycopg (AI service).
    python = "postgresql://${local.db_auth}?sslmode=verify-full&sslrootcert=${local.rds_ca}"
  })
}

resource "random_password" "ai_service_token" {
  length  = 48
  special = false
}

resource "random_password" "widget_token_secret" {
  length  = 48
  special = false
}

resource "random_bytes" "encryption_key" {
  length = 32
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/app"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    AI_SERVICE_TOKEN    = random_password.ai_service_token.result
    WIDGET_TOKEN_SECRET = random_password.widget_token_secret.result
    ENCRYPTION_KEY      = random_bytes.encryption_key.base64
    # Fill these in after the first apply.
    SUPABASE_JWT_SECRET       = ""
    SUPABASE_ANON_KEY         = ""
    SMTP_URL                  = ""
    OPENAI_API_KEY            = ""
    DEEPSEEK_API_KEY          = ""
    DODO_PAYMENTS_API_KEY     = ""
    DODO_PAYMENTS_WEBHOOK_KEY = ""
    DODO_PRODUCT_STARTER      = ""
    DODO_PRODUCT_GROWTH       = ""
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

locals {
  app_secret_keys = [
    "AI_SERVICE_TOKEN", "WIDGET_TOKEN_SECRET", "ENCRYPTION_KEY", "SUPABASE_JWT_SECRET", "SUPABASE_ANON_KEY",
    "SMTP_URL", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY",
    "DODO_PRODUCT_STARTER", "DODO_PRODUCT_GROWTH",
  ]
  # ECS "valueFrom" references to individual JSON keys.
  app_secret = { for k in local.app_secret_keys : k => "${aws_secretsmanager_secret.app.arn}:${k}::" }
  db_secret  = { for k in ["node", "prisma", "python"] : k => "${aws_secretsmanager_secret.database.arn}:${k}::" }
}
