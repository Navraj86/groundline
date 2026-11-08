# Deploying Groundline to AWS

This guide takes you from an empty AWS account to Groundline running on ECS Fargate, then
sets up one-click deploys from GitHub. Plan on about an hour the first time, most of it
waiting for the database and certificates.

What gets created (all in `deploy/terraform`):

```
Internet ──▶ Application Load Balancer (HTTPS)
               ├─ /webhooks/* ──▶ api ─┐
               └─ everything else ──▶ web ──▶ api ──▶ ai        (ECS Fargate, private subnets,
                                         worker ──┘            Service Connect between them)
                                │
                                ├─▶ RDS Postgres 17 + pgvector  (encrypted, TLS only, backups)
                                ├─▶ ElastiCache Redis (TLS)     (queues and cache)
                                ├─▶ S3 bucket                   (uploaded knowledge files)
                                └─▶ Secrets Manager             (database URLs, keys)
Outside AWS: Supabase (sign-in), OpenAI / DeepSeek (AI), Dodo Payments (billing)
```

> **Cost.** With the defaults (2 web, 2 api, 1 worker and 1 AI task, `db.t4g.small`,
> `cache.t4g.micro`, one NAT gateway) expect roughly **US$200–250 a month** before traffic and
> AI usage. For a low-traffic start, set every `desired_count` to 1 in `terraform.tfvars`
> (about US$150). Check current prices for your region with the
> [AWS Pricing Calculator](https://calculator.aws/). Nothing is charged until you run
> `terraform apply`.

The commands below are for **Git Bash** on Windows (or any bash on macOS/Linux), run from the
repository root unless a step says otherwise.

---

## 1. Install the tools

| Tool | Check | Get it |
| --- | --- | --- |
| AWS CLI v2 | `aws --version` | https://aws.amazon.com/cli/ |
| Terraform 1.10 or newer | `terraform version` | https://developer.hashicorp.com/terraform/install (Windows: `winget install Hashicorp.Terraform`) |
| Docker Desktop | `docker version` | Already installed for local development |

## 2. Prepare your AWS account

1. Sign in to the AWS console as the root user only to create an **IAM Identity Center** user
   (or an IAM user) with the `AdministratorAccess` permission set, and turn on MFA for it.
   Don't use the root user for the steps below.
2. Configure the CLI with that user. With IAM Identity Center:
   ```bash
   aws configure sso          # profile name: groundline
   export AWS_PROFILE=groundline
   ```
   With an IAM user's access key instead: `aws configure --profile groundline`.
3. Pick a region close to your customers and use it everywhere below:
   ```bash
   export AWS_REGION=ap-south-1
   aws sts get-caller-identity   # shows your account ID: it works
   ```

## 3. Create the Terraform state bucket (once per account)

Terraform keeps track of what it created in a state file. It also contains generated
secrets, so it lives in a private, encrypted, versioned bucket.

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=groundline-terraform-state-$ACCOUNT
aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"   # omit this line in us-east-1
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "$BUCKET"
```

## 4. Set up the services outside AWS

**Supabase (sign-in).** Create a project at https://supabase.com, then:

- *Project Settings → API*: copy the **Project URL** and the **anon / publishable key**. Your
  `supabase_auth_url` is `<Project URL>/auth/v1`.
- *Project Settings → JWT Keys*: if the project still uses the **legacy JWT secret**, copy it.
  New projects sign tokens with asymmetric keys instead; then leave `SUPABASE_JWT_SECRET`
  empty and the API verifies tokens against the project's public keys.
- *Authentication → URL Configuration*: set **Site URL** to `https://<your domain>` and add
  `https://<your domain>/auth/callback**` to **Redirect URLs**.
- *Authentication → SMTP Settings*: Supabase's built-in email is limited to a few messages an
  hour. Add your own SMTP (Amazon SES works; see below) before real users sign up.

**Email (Amazon SES).** Groundline sends invitation emails itself. In the SES console, verify
your domain, request production access (new accounts start in a sandbox that only emails
verified addresses), and create SMTP credentials. Your `SMTP_URL` is
`smtps://<SMTP username>:<URL-encoded SMTP password>@email-smtp.<region>.amazonaws.com:465`.

**Domain (recommended).** If your domain's DNS is in Route 53, note the **hosted zone ID**;
Terraform will issue the HTTPS certificate and create the record. If DNS is elsewhere, request
a certificate in **ACM** (same region), add its validation CNAME at your DNS provider, and use
its ARN as `certificate_arn`. You can also leave `domain_name` empty for a first test over
plain HTTP on the load balancer's address.

## 5. Configure Terraform

```bash
cd deploy/terraform
cp backend.hcl.example backend.hcl          # set bucket = the name printed in step 3, and region
cp terraform.tfvars.example terraform.tfvars # set region, supabase_auth_url, domain, emails...
terraform init -backend-config=backend.hcl
```

Both files are git-ignored. Keep `github_repository` set if you want deploys from GitHub
(step 10).

## 6. Create the image repositories and push the first images

ECS can only start once images exist, so create the ECR repositories first:

```bash
terraform apply -target=aws_ecr_repository.app -var image_tag=bootstrap
cd ../..
deploy/scripts/push-images.sh            # builds and pushes web, api, migrate, ai (10–15 min)
TAG=$(git rev-parse HEAD); echo "$TAG"
```

## 7. Create everything else

```bash
cd deploy/terraform
terraform plan -var image_tag="$TAG"      # review: about 90 resources to add
terraform apply -var image_tag="$TAG"     # 15–25 minutes, mostly the database and Redis
```

When it finishes, `terraform output` shows the app URL, the webhook URL and the name of the
secret to fill in next. Until step 8 the API keeps restarting because its Supabase key is
missing; that's expected.

## 8. Add your credentials and run migrations

Open **Secrets Manager → `groundline-prod/app` → Retrieve secret value → Edit** and fill in:

| Key | Value |
| --- | --- |
| `SUPABASE_ANON_KEY` | anon / publishable key from step 4 |
| `SUPABASE_JWT_SECRET` | legacy JWT secret, or empty for projects with signing keys |
| `SMTP_URL` | from step 4 |
| `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | at least one of them |
| `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY` | from the Dodo dashboard (step 9) |
| `DODO_PRODUCT_STARTER`, `DODO_PRODUCT_GROWTH` | product IDs of the paid plans |

`AI_SERVICE_TOKEN`, `WIDGET_TOKEN_SECRET` and `ENCRYPTION_KEY` were generated for you; leave
them as they are. (Changing `ENCRYPTION_KEY` later makes stored connector secrets unreadable.)

Then create the database tables and plans, and restart the services so they pick up the
secrets:

```bash
deploy/scripts/migrate.sh
for s in web api worker ai; do
  aws ecs update-service --cluster groundline-prod --service $s --force-new-deployment >/dev/null
done
aws ecs wait services-stable --cluster groundline-prod --services web api worker ai
```

Open the app URL from `terraform output app_url`, sign up, and confirm your email.

## 9. Connect payments

In the Dodo Payments dashboard (test mode first), add a webhook pointing at
`terraform output webhook_url` (`https://<your domain>/webhooks/dodo`), copy its signing key
into `DODO_PAYMENTS_WEBHOOK_KEY`, and restart the API as in step 8. When you go live, set
`dodo_payments_environment = "live_mode"` in `terraform.tfvars`, use live keys, and apply again.

## 10. Deploy from GitHub from now on

1. In the repository, open **Settings → Environments → New environment**, name it
   `production`, and add yourself under **Required reviewers**.
2. Add these **environment variables** (not secrets; none of them are sensitive):

   | Variable | Value |
   | --- | --- |
   | `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |
   | `AWS_REGION` | your region |
   | `TF_BACKEND_CONFIG` | the full contents of `backend.hcl` |
   | `TF_VARS` | the full contents of `terraform.tfvars` |

3. To deploy, open **Actions → Deploy to AWS → Run workflow**, choose the branch or commit, and
   approve it. The workflow builds and pushes the images, runs migrations, applies Terraform
   with the new image tag, and waits until every service is healthy. A deploy whose new tasks
   don't become healthy rolls back on its own.

GitHub authenticates to AWS with OpenID Connect; no AWS keys are stored in GitHub. Only jobs
in the `production` environment can assume the deploy role.

## Day-to-day operations

- **Logs:** CloudWatch → Log groups → `/ecs/groundline-prod/<service>`, or
  `aws logs tail /ecs/groundline-prod/api --follow`.
- **Health:** `https://<your domain>` and the ECS console. Alarms (server errors, unhealthy
  web tasks, database CPU and storage, Redis memory) email `alarm_email`; confirm the
  subscription email AWS sends you.
- **Shell in a container:** `aws ecs execute-command --cluster groundline-prod --task <task-id> --container api --interactive --command sh`
  (needs the Session Manager plugin for the AWS CLI).
- **Scaling:** web, api, worker and ai scale on CPU between `desired_count` and `max_count`.
  Change the numbers in `terraform.tfvars` and apply.
- **Backups:** RDS keeps 7 days of automatic backups with point-in-time restore. Uploaded
  files are versioned in S3.
- **Rotating secrets:** edit the value in Secrets Manager, then force a new deployment of the
  services that use it.

## Tearing it down

The database, load balancer and repositories are protected against accidental deletion.
To remove everything:

```bash
cd deploy/terraform
# 1. Turn off deletion protection on the database and the load balancer:
aws rds modify-db-instance --db-instance-identifier groundline-prod --no-deletion-protection --apply-immediately
aws elbv2 modify-load-balancer-attributes --load-balancer-arn "$(aws elbv2 describe-load-balancers --names groundline-prod --query 'LoadBalancers[0].LoadBalancerArn' --output text)" \
  --attributes Key=deletion_protection.enabled,Value=false
# 2. Empty the image repositories and the uploads bucket, then:
terraform destroy -var image_tag="$TAG"
```

A final database snapshot (`groundline-prod-final`) is kept until you delete it.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Tasks stop with `ResourceInitializationError` | The image tag doesn't exist in ECR, or the secret can't be read. Re-run `push-images.sh` with the same tag. |
| API logs `Invalid environment configuration` | A required secret is empty (e.g. `SUPABASE_ANON_KEY`); see step 8. |
| Sign-in works but email links fail | The Supabase Redirect URLs don't include `https://<domain>/auth/callback**`. |
| `migrate.sh` fails | Read `/ecs/groundline-prod/migrate` in CloudWatch. Migrations are safe to re-run. |
| Webhooks return 401 | `DODO_PAYMENTS_WEBHOOK_KEY` doesn't match the webhook's signing key. |
| Answers say the knowledge base has nothing | No AI key set, or sources were processed before one was. Reprocess them from the Knowledge base page. |
