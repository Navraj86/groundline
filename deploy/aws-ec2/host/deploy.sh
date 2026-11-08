#!/usr/bin/env bash
# Deploys one release of the Groundline backend on the EC2 instance.
#
#   groundline-deploy <image-tag>      (installed by the instance's user data)
#
# Runs as root, usually through SSM Run Command from GitHub Actions. Steps:
#   1. fetch this release's compose files from GitHub (at the same commit as the images);
#   2. build .env from SSM Parameter Store (config + secrets);
#   3. pull images, run migrations, and restart the services;
#   4. wait until the API is ready, or roll back to the previous release.
set -euo pipefail

TAG="${1:?usage: groundline-deploy <image-tag>}"
# shellcheck source=/dev/null
source /etc/groundline.conf # ENVIRONMENT, AWS_REGION, PARAM_PATH, LOG_GROUP, REPOSITORY
DIR=/opt/groundline
cd "$DIR"
log() { echo "[$(date -u +%H:%M:%S)] $*"; }
compose() { docker compose -f docker-compose.yml -f docker-compose.aws.yml "$@"; }

log "Deploying $TAG"

# 1. Compose files for this release.
for f in docker-compose.yml docker-compose.aws.yml Caddyfile; do
  curl -fsSL --retry 3 "https://raw.githubusercontent.com/$REPOSITORY/$TAG/deploy/aws-ec2/host/$f" -o "$f.new"
  mv "$f.new" "$f"
done

# 2. Environment: Terraform-managed config, then secrets (one parameter each; "-" means unset).
umask 077
{
  aws ssm get-parameter --region "$AWS_REGION" --name "${PARAM_PATH}config" --query Parameter.Value --output text
  echo
  aws ssm get-parameters-by-path --region "$AWS_REGION" --path "${PARAM_PATH}secrets/" --with-decryption \
    --query 'Parameters[].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do
      key="${name##*/}"
      [ "$value" = "-" ] && value=""
      if [[ "$value" == *"'"* ]]; then
        echo "Secret $key contains a single quote, which .env files can't hold safely." >&2
        exit 1
      fi
      printf "%s='%s'\n" "$key" "$value"
    done
  printf "IMAGE_TAG=%s\nAWS_REGION=%s\nLOG_GROUP=%s\n" "$TAG" "$AWS_REGION" "$LOG_GROUP"
} > .env.new
mv .env.new .env

ready() {
  for _ in $(seq 1 30); do
    if compose exec -T api wget -qO- http://127.0.0.1:4000/health/ready >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  return 1
}

# 3. Release.
log "Pulling images"
compose pull --quiet api worker ai migrate caddy redis
log "Running migrations"
compose run --rm migrate
log "Starting services"
compose up -d --remove-orphans

# 4. Verify, or roll back.
if ready; then
  echo "$TAG" > .deployed
  docker image prune -af --filter "until=168h" >/dev/null || true
  log "Deployed $TAG"
  exit 0
fi

log "The API didn't become ready."
compose logs --tail 50 api || true
previous=$(cat .deployed 2>/dev/null || true)
if [ -n "$previous" ] && [ "$previous" != "$TAG" ]; then
  log "Rolling back to $previous (migrations are not reverted)"
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$previous/" .env
  compose up -d --remove-orphans
fi
exit 1
