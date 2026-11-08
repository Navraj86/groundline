#!/bin/bash
# First-boot setup for the Groundline backend instance (Amazon Linux 2023, arm64).
# Paste into EC2 → Launch instance → Advanced details → User data (Terraform passes it too).
# Installs Docker with Compose, adds swap, and installs the `groundline-deploy` command.
# Nothing is deployed here: the first deploy runs once the secrets are in Parameter Store.

# ---- Settings (the only lines you might edit) -----------------------------------------
GROUNDLINE_ENVIRONMENT="prod"                 # parameters live under /groundline/<this>/
GROUNDLINE_REPOSITORY="Navraj86/groundline"   # GitHub repo the deploy files come from
# -----------------------------------------------------------------------------------------

set -euxo pipefail

# Region of this instance, from the instance metadata service.
imds_token=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
region=$(curl -fsS -H "X-aws-ec2-metadata-token: $imds_token" http://169.254.169.254/latest/meta-data/placement/region)

dnf install -y docker
systemctl enable --now docker

# Docker Compose v2 plugin (not packaged for Amazon Linux).
mkdir -p /usr/libexec/docker/cli-plugins
curl -fsSL --retry 5 -o /usr/libexec/docker/cli-plugins/docker-compose \
  "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-aarch64"
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

# 2 GB of swap: headroom for deploys, when old and new containers briefly overlap.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon -a
sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/90-groundline.conf

# Rotate Docker's own logs too (containers log to CloudWatch, but the daemon keeps a copy).
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
systemctl restart docker

cat > /etc/groundline.conf <<CONF
ENVIRONMENT=$GROUNDLINE_ENVIRONMENT
AWS_REGION=$region
PARAM_PATH=/groundline/$GROUNDLINE_ENVIRONMENT/
LOG_GROUP=/groundline/$GROUNDLINE_ENVIRONMENT
REPOSITORY=$GROUNDLINE_REPOSITORY
CONF

mkdir -p /opt/groundline

# `groundline-deploy <commit-sha>` runs the deploy script from the same commit as the images.
cat > /usr/local/bin/groundline-deploy <<'SH'
#!/bin/bash
set -euo pipefail
source /etc/groundline.conf
tag="${1:?usage: groundline-deploy <commit-sha>}"
curl -fsSL --retry 3 "https://raw.githubusercontent.com/$REPOSITORY/$tag/deploy/aws-ec2/host/deploy.sh" -o /opt/groundline/deploy.sh
exec bash /opt/groundline/deploy.sh "$tag"
SH
chmod +x /usr/local/bin/groundline-deploy

# Automatic security updates for the OS.
dnf install -y dnf-automatic
sed -i 's/^upgrade_type.*/upgrade_type = security/; s/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
systemctl enable --now dnf-automatic.timer
