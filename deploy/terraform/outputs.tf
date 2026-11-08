output "app_url" {
  description = "Where the app is served."
  value       = local.app_url
}

output "load_balancer_dns" {
  description = "Point your domain here (CNAME or alias) if DNS isn't in Route 53."
  value       = aws_lb.main.dns_name
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "migrate_task_definition" {
  value = aws_ecs_task_definition.migrate.family
}

output "private_subnet_ids" {
  description = "For running one-off tasks such as migrations."
  value       = [for s in aws_subnet.private : s.id]
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}

output "app_secret_name" {
  description = "Fill in provider keys here after the first apply."
  value       = aws_secretsmanager_secret.app.name
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.id
}

output "webhook_url" {
  description = "Register this as the Dodo Payments webhook endpoint."
  value       = "${local.app_url}/webhooks/dodo"
}

output "github_deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN variable of the repository's production environment."
  value       = var.github_repository != "" ? aws_iam_role.github_deploy[0].arn : null
}
