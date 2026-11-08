resource "aws_sns_topic" "alarms" {
  name = "${local.name}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  alarms = {
    alb_5xx = {
      description = "The app is returning server errors"
      namespace   = "AWS/ApplicationELB"
      metric      = "HTTPCode_Target_5XX_Count"
      stat        = "Sum"
      threshold   = 10
      dimensions  = { LoadBalancer = aws_lb.main.arn_suffix }
    }
    web_unhealthy = {
      description = "Web tasks are failing health checks"
      namespace   = "AWS/ApplicationELB"
      metric      = "UnHealthyHostCount"
      stat        = "Maximum"
      threshold   = 0
      dimensions  = { LoadBalancer = aws_lb.main.arn_suffix, TargetGroup = aws_lb_target_group.web.arn_suffix }
    }
    db_cpu = {
      description = "Postgres CPU is high"
      namespace   = "AWS/RDS"
      metric      = "CPUUtilization"
      stat        = "Average"
      threshold   = 80
      dimensions  = { DBInstanceIdentifier = aws_db_instance.main.identifier }
    }
    db_storage = {
      description = "Postgres is running out of storage (under 2 GB free)"
      namespace   = "AWS/RDS"
      metric      = "FreeStorageSpace"
      stat        = "Minimum"
      threshold   = 2 * 1024 * 1024 * 1024
      comparison  = "LessThanThreshold"
      dimensions  = { DBInstanceIdentifier = aws_db_instance.main.identifier }
    }
    redis_memory = {
      description = "Redis memory is nearly full; queued jobs could be rejected"
      namespace   = "AWS/ElastiCache"
      metric      = "DatabaseMemoryUsagePercentage"
      stat        = "Maximum"
      threshold   = 80
      dimensions  = { ReplicationGroupId = aws_elasticache_replication_group.main.id }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "app" {
  for_each            = local.alarms
  alarm_name          = "${local.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.stat
  dimensions          = each.value.dimensions
  period              = 300
  evaluation_periods  = 2
  threshold           = each.value.threshold
  comparison_operator = lookup(each.value, "comparison", "GreaterThanThreshold")
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}
