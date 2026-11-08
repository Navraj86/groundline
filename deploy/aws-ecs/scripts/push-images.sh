#!/usr/bin/env bash
# Builds the Groundline images and pushes them to the stack's ECR repositories.
#
#   deploy/aws-ecs/scripts/push-images.sh [tag]
#
# The tag defaults to the current commit SHA. Run from anywhere inside the repository with
# AWS credentials for the target account and AWS_REGION set. Extra `docker buildx build`
# arguments (for example cache settings in CI) can be passed in BUILD_ARGS.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
TAG="${1:-$(git rev-parse HEAD)}"
: "${AWS_REGION:?Set AWS_REGION}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

build() { # name dockerfile target
  local repo="groundline/$1" image="$REGISTRY/groundline/$1:$TAG"
  # Tags are immutable, so an image already pushed for this commit is reused.
  if aws ecr describe-images --region "$AWS_REGION" --repository-name "$repo" --image-ids imageTag="$TAG" >/dev/null 2>&1; then
    echo "✓ $image already pushed"
    return
  fi
  echo "→ building $image"
  # ECS runs x86_64 tasks; build for that even on ARM machines.
  # shellcheck disable=SC2086
  docker buildx build --platform linux/amd64 --file "$2" --target "$3" --tag "$image" ${BUILD_ARGS:-} --push .
}

build web apps/web/Dockerfile runtime
build api apps/api/Dockerfile runtime
build migrate apps/api/Dockerfile migrate
build ai apps/ai/Dockerfile runtime

echo "Pushed images tagged $TAG"
