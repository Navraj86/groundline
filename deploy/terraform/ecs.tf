resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# Services find each other by name (http://api:4000, http://ai:8000) through Service Connect.
resource "aws_service_discovery_http_namespace" "main" {
  name = local.name
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["web", "api", "worker", "ai", "migrate"])
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = var.log_retention_days
}

locals {
  image = { for k, r in aws_ecr_repository.app : k => "${r.repository_url}:${var.image_tag}" }

  # Settings shared by the API, the worker and the migration task.
  node_env = {
    WEB_URL                   = local.app_url
    REDIS_URL                 = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
    QUEUE_PREFIX              = "groundline"
    SUPABASE_AUTH_URL         = var.supabase_auth_url
    MAIL_FROM                 = var.mail_from
    DODO_PAYMENTS_ENVIRONMENT = var.dodo_payments_environment
    # Empty endpoint and keys: the AWS SDK uses S3 and the task role.
    S3_ENDPOINT               = ""
    S3_REGION                 = var.region
    S3_BUCKET                 = aws_s3_bucket.uploads.id
    S3_ACCESS_KEY             = ""
    S3_SECRET_KEY             = ""
    AI_SERVICE_URL            = "http://ai:8000"
    ANSWER_REVIEW_SAMPLE_RATE = tostring(var.answer_review_sample_rate)
    # Requests reach the API through the load balancer or the web app, both in the VPC.
    TRUST_PROXY         = "uniquelocal"
    NODE_EXTRA_CA_CERTS = local.rds_ca
  }
  node_secrets = merge(
    { DATABASE_URL = local.db_secret.node },
    { for k in [
      "AI_SERVICE_TOKEN", "WIDGET_TOKEN_SECRET", "ENCRYPTION_KEY", "SUPABASE_JWT_SECRET", "SUPABASE_ANON_KEY",
      "SMTP_URL", "DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY",
    ] : k => local.app_secret[k] },
  )

  containers = {
    web = {
      port    = 3000
      command = null
      env = {
        API_URL        = "http://api:4000"
        PUBLIC_WEB_URL = local.app_url
      }
      secrets = {}
    }
    api = {
      port    = 4000
      command = null
      env     = merge(local.node_env, { WORKERS_ENABLED = "false" })
      secrets = local.node_secrets
    }
    worker = {
      port    = null
      command = ["node", "dist/worker.js"]
      env     = local.node_env
      secrets = local.node_secrets
    }
    ai = {
      port    = 8000
      command = null
      env = {
        ENVIRONMENT   = "production"
        S3_ENDPOINT   = ""
        S3_REGION     = var.region
        S3_BUCKET     = aws_s3_bucket.uploads.id
        S3_ACCESS_KEY = ""
        S3_SECRET_KEY = ""
      }
      secrets = merge(
        { DATABASE_URL = local.db_secret.python },
        { for k in ["AI_SERVICE_TOKEN", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"] : k => local.app_secret[k] },
      )
    }
  }
  image_for = { web = "web", api = "api", worker = "api", ai = "ai" }
}

resource "aws_ecs_task_definition" "app" {
  for_each                 = local.containers
  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.services[each.key].cpu
  memory                   = var.services[each.key].memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = each.key
    image     = local.image[local.image_for[each.key]]
    essential = true
    command   = each.value.command
    portMappings = each.value.port == null ? [] : [{
      name          = "http"
      containerPort = each.value.port
      protocol      = "tcp"
      appProtocol   = "http"
    }]
    environment = [for k, v in each.value.env : { name = k, value = v }]
    secrets     = [for k, v in each.value.secrets : { name = k, valueFrom = v }]
    # The worker has no HTTP server, so it has no container health check.
    healthCheck = each.key == "worker" ? null : {
      command     = each.key == "ai" ? ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)\""] : ["CMD-SHELL", "wget -qO- http://127.0.0.1:${each.value.port}/${each.key == "api" ? "health" : ""} >/dev/null || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    linuxParameters = { initProcessEnabled = true }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[each.key].name
        awslogs-region        = var.region
        awslogs-stream-prefix = each.key
      }
    }
    readonlyRootFilesystem = false
  }])
}

resource "aws_ecs_service" "app" {
  for_each               = local.containers
  name                   = each.key
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.app[each.key].arn
  desired_count          = var.services[each.key].desired_count
  launch_type            = "FARGATE"
  enable_execute_command = true
  propagate_tags         = "SERVICE"

  # Rolling deploys that roll back on their own when new tasks don't become healthy.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  health_check_grace_period_seconds = contains(["web", "api"], each.key) ? 60 : null

  network_configuration {
    subnets          = [for s in aws_subnet.private : s.id]
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = contains(["web", "api"], each.key) ? [1] : []
    content {
      target_group_arn = each.key == "web" ? aws_lb_target_group.web.arn : aws_lb_target_group.api.arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn

    dynamic "service" {
      for_each = contains(["api", "ai"], each.key) ? [1] : []
      content {
        port_name      = "http"
        discovery_name = each.key
        client_alias {
          port     = each.value.port
          dns_name = each.key
        }
      }
    }
  }

  lifecycle {
    # Autoscaling owns the running count once the service exists.
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener.http, aws_iam_role_policy.execution_secrets]
}

# ---- Migrations: a one-off task, run before each deploy rolls out -------------------------

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "migrate"
    image     = local.image["migrate"]
    essential = true
    environment = [
      { name = "NODE_EXTRA_CA_CERTS", value = local.rds_ca },
    ]
    secrets = concat(
      [
        { name = "DATABASE_URL", valueFrom = local.db_secret.node },
        { name = "MIGRATE_DATABASE_URL", valueFrom = local.db_secret.prisma },
      ],
      [for k in ["DODO_PRODUCT_STARTER", "DODO_PRODUCT_GROWTH"] : { name = k, valueFrom = local.app_secret[k] }],
    )
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app["migrate"].name
        awslogs-region        = var.region
        awslogs-stream-prefix = "migrate"
      }
    }
  }])
}

# ---- Autoscaling on CPU -----------------------------------------------------------------

resource "aws_appautoscaling_target" "app" {
  for_each           = local.containers
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.services[each.key].desired_count
  max_capacity       = var.services[each.key].max_count
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = aws_appautoscaling_target.app
  name               = "${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = each.value.service_namespace
  resource_id        = each.value.resource_id
  scalable_dimension = each.value.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
