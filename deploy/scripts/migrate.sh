#!/usr/bin/env bash
# Runs the migration task (Prisma migrations + plan catalog seed) on ECS and waits for it.
#
#   deploy/scripts/migrate.sh
#
# Uses the outputs of the Terraform stack in deploy/terraform, so run it after `terraform
# apply` has created (or updated) the migrate task definition. Exits non-zero on failure.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)/deploy/terraform"
: "${AWS_REGION:?Set AWS_REGION}"

cluster=$(terraform output -raw ecs_cluster)
family=$(terraform output -raw migrate_task_definition)
subnets=$(terraform output -json private_subnet_ids | tr -d '[]" \n')
sg=$(terraform output -raw app_security_group_id)

task=$(aws ecs run-task --region "$AWS_REGION" --cluster "$cluster" --task-definition "$family" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$sg],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)
echo "Migration task started: $task"

aws ecs wait tasks-stopped --region "$AWS_REGION" --cluster "$cluster" --tasks "$task"
code=$(aws ecs describe-tasks --region "$AWS_REGION" --cluster "$cluster" --tasks "$task" \
  --query 'tasks[0].containers[0].exitCode' --output text)
if [ "$code" != "0" ]; then
  reason=$(aws ecs describe-tasks --region "$AWS_REGION" --cluster "$cluster" --tasks "$task" --query 'tasks[0].stoppedReason' --output text)
  echo "Migrations failed (exit code $code, $reason). Logs: CloudWatch group /ecs/$cluster/migrate" >&2
  exit 1
fi
echo "Migrations applied."
