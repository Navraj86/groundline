output "api_url" {
  description = "Set this as API_URL in Vercel."
  value       = "https://${local.api_domain}"
}

output "public_ip" {
  description = "Point your API domain's A record here (when api_domain is set)."
  value       = aws_eip.api.public_ip
}

output "instance_id" {
  description = "Set as AWS_INSTANCE_ID in the GitHub production environment."
  value       = aws_instance.api.id
}

output "webhook_url" {
  description = "Register this as the Dodo Payments webhook endpoint."
  value       = "https://${local.api_domain}/webhooks/dodo"
}

output "parameter_path" {
  description = "Secrets to fill in are under <path>secrets/."
  value       = local.param_path
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.id
}

output "log_group" {
  value = aws_cloudwatch_log_group.api.name
}

output "github_deploy_role_arn" {
  description = "Set as AWS_DEPLOY_ROLE_ARN in the GitHub production environment."
  value       = var.github_deploy ? aws_iam_role.github_deploy[0].arn : null
}

output "proxy_secret" {
  description = "Set as PROXY_SECRET in Vercel (terraform output -raw proxy_secret)."
  value       = random_password.generated["PROXY_SECRET"].result
  sensitive   = true
}
