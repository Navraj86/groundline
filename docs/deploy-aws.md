# Deploying Groundline (low-cost: AWS + free tiers)

This is the default way to run Groundline: the backend on **one small AWS instance**, and free
tiers for everything else. It costs about **US$15–20 a month**, all of it AWS. When you
outgrow one server, [deploy-aws-ecs.md](deploy-aws-ecs.md) describes the scale-up setup on
ECS Fargate.

```
 Browser ──▶ Vercel (free) ─── Next.js web app
                 │  server-side calls, HTTPS
                 ▼
 AWS EC2 t4g.small (Graviton, Docker Compose) ── Elastic IP, HTTPS by Caddy + Let's Encrypt
   caddy ─▶ api ─▶ ai          worker          redis
   │         │       │
   │         └───────┴──▶ Supabase (free): Postgres + pgvector, and sign-in
   │                 └──▶ AWS S3: uploaded knowledge files
   └─ /webhooks/dodo ◀── Dodo Payments
 Config and secrets: SSM Parameter Store · Logs and alarms: CloudWatch · Budget alert: AWS Budgets
 Images: GitHub Container Registry (free) · Deploys: GitHub Actions → SSM (no SSH)
```

## What it costs

| Item | Monthly (approx.) |
| --- | --- |
| EC2 `t4g.small` (2 vCPU, 2 GB), on demand | US$10–13 depending on region |
| Public IPv4 address (Elastic IP) | US$3.65 |
| 20 GB encrypted gp3 disk | US$1.60–1.90 |
| S3, CloudWatch Logs, SSM parameters, alarms, data transfer at showcase traffic | under US$1 (mostly free tier) |
| **Total** | **about US$15–20** |
| Vercel Hobby, Supabase Free, GitHub Container Registry, Let's Encrypt, sslip.io | free |

A budget alert (default US$25) emails you if the month's bill is forecast to go over. To go
cheaper, `instance_type = "t4g.micro"` (1 GB, about US$6) also works for light use, with the
2 GB swap file taking up the slack. New AWS accounts often come with Free Tier credits; check
**Billing → Free Tier / Credits**, which can cover this setup for months.

Free-tier limits to know about:

- **Supabase Free** pauses a project after a week without activity, and allows 500 MB of
  database. Groundline's background jobs query the database every few minutes, which counts
  as activity, but check the dashboard if the site has been idle.
- **Vercel Hobby** is for non-commercial use, and its functions accept request bodies up to
  4.5 MB, so knowledge-base uploads are limited to about 4 MB there (pasted text and web pages
  are unaffected).

Commands below are for **Git Bash** on Windows (or bash on macOS/Linux), from the repository
root unless a step says otherwise.

---

## 1. Install the tools

- **AWS CLI v2:** https://aws.amazon.com/cli/ (`aws --version`)
- **Terraform 1.10+:** `winget install Hashicorp.Terraform` (`terraform version`)
- **Session Manager plugin** (optional, for a shell on the server):
  https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html

## 2. Prepare the AWS account

1. Create an **IAM Identity Center** user (or IAM user) with `AdministratorAccess`, turn on MFA,
   and stop using the root user.
2. Configure the CLI and choose a region, ideally the same as your Supabase project:
   ```bash
   aws configure sso            # profile name: groundline
   export AWS_PROFILE=groundline AWS_REGION=ap-south-1
   aws sts get-caller-identity  # prints your account: it works
   ```

## 3. Create the Terraform state bucket (once)

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=groundline-terraform-state-$ACCOUNT
aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"   # omit this line in us-east-1
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## 4. Supabase: database and sign-in (free)

1. Create a project at https://supabase.com (pick the region closest to your AWS region) and
   save the database password.
2. **Database → Extensions:** enable `vector`.
3. **Connect** (top bar) → **Session pooler**: copy the connection string. It looks like
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Groundline needs it three ways (the Node, Prisma and Python drivers spell TLS options
   differently); keep these for step 7:
   - `DATABASE_URL` = `<string>?sslmode=require&uselibpqcompat=true`
   - `MIGRATE_DATABASE_URL` = `<string>?sslmode=require`
   - `AI_DATABASE_URL` = `<string>?sslmode=require`
4. **Project Settings → API:** copy the **anon / publishable key**. Under **JWT Keys**, copy the
   legacy JWT secret if the project has one; new projects sign tokens with asymmetric keys, and
   then you leave `SUPABASE_JWT_SECRET` unset.
5. **Authentication → URL Configuration:** you'll set these in step 8, once you know the
   Vercel URL.

## 5. Vercel: create the web project (free)

1. At https://vercel.com, **Add New → Project**, import the GitHub repository.
2. Set **Root Directory** to `apps/web`. The framework (Next.js) and build command come from
   `apps/web/vercel.json`.
3. Deploy. It builds, but pages that need the API show errors until step 8. Note the URL, e.g.
   `https://groundline.vercel.app`.

## 6. Create the AWS resources

```bash
cd deploy/aws-ec2/terraform
cp backend.hcl.example backend.hcl            # bucket = the name from step 3, region
cp terraform.tfvars.example terraform.tfvars  # region, emails, web_url, supabase_auth_url
terraform init -backend-config=backend.hcl
terraform apply                               # about 40 resources, 2–3 minutes
terraform output                              # api_url, instance_id, public_ip, ...
```

Confirm the two emails AWS sends you (alarm and budget notifications).

The API gets a free hostname like `https://13-233-10-5.sslip.io`. To use your own, set
`api_domain = "api.example.com"` in `terraform.tfvars`, add an **A record** for it pointing at
the `public_ip` output, and apply again.

## 7. Add your secrets

Terraform generated the internal keys (`AI_SERVICE_TOKEN`, `WIDGET_TOKEN_SECRET`,
`ENCRYPTION_KEY`, `PROXY_SECRET`). Set the rest in SSM Parameter Store; each is stored
encrypted. Values you leave as `-` count as unset.

```bash
P=$(terraform output -raw parameter_path)secrets
put() { aws ssm put-parameter --name "$P/$1" --type SecureString --overwrite --value "$2" >/dev/null && echo "set $1"; }

put DATABASE_URL         'postgresql://postgres.REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true'
put MIGRATE_DATABASE_URL 'postgresql://postgres.REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require'
put AI_DATABASE_URL      'postgresql://postgres.REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require'
put SUPABASE_ANON_KEY    'eyJ...'
put SUPABASE_JWT_SECRET  '...'          # or skip for projects with signing keys
put DEEPSEEK_API_KEY     'sk-...'       # and/or OPENAI_API_KEY
put SMTP_URL             'smtps://resend:re_xxx@smtp.resend.com:465'
```

For email, any SMTP provider works; free tiers include Resend (3,000 emails a month) and
Brevo (300 a day). Add the same SMTP settings in Supabase under **Authentication → SMTP
Settings**, since Supabase's built-in email only sends a few messages an hour. Dodo Payments
keys can wait for step 10. A database password with special characters must be
URL-encoded, and no value may contain a single quote.

You can also edit these in the console: **Systems Manager → Parameter Store**.

## 8. Connect Vercel and Supabase to the API

**Vercel → Project → Settings → Environment Variables** (Production), then redeploy:

| Name | Value |
| --- | --- |
| `API_URL` | `terraform output -raw api_url` |
| `PUBLIC_WEB_URL` | your Vercel URL |
| `PROXY_SECRET` | `terraform output -raw proxy_secret` |

**Supabase → Authentication → URL Configuration:** set **Site URL** to your Vercel URL and add
`<Vercel URL>/auth/callback**` to **Redirect URLs**.

## 9. Publish images and deploy from GitHub

1. CI publishes images to GitHub Container Registry on every push to `main`. Make them
   pullable without a login: on GitHub, open your profile → **Packages**, and for each of
   `groundline/api`, `groundline/ai` and `groundline/migrate` choose **Package settings →
   Change visibility → Public**. (Do this once, after the first CI run on `main`.)
2. In the repository, **Settings → Environments → New environment** named `production`, with
   these **variables**:

   | Variable | Value |
   | --- | --- |
   | `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |
   | `AWS_REGION` | your region |
   | `AWS_INSTANCE_ID` | `terraform output -raw instance_id` |

3. **Actions → Deploy backend to AWS (EC2) → Run workflow**, with the latest commit SHA of
   `main` (`git rev-parse origin/main`). The run shows the server's deploy log: it pulls the
   images, runs migrations, starts the containers, and waits for the API. If the API doesn't
   come up, it rolls back to the previous release.

From now on every push to `main` that passes CI deploys automatically (add required reviewers
to the `production` environment if you'd rather approve each one). Vercel deploys the web app
on its own.

## 10. Payments (when you need them)

In Dodo Payments (test mode), add a webhook to `terraform output -raw webhook_url`, then
`put` `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`, `DODO_PRODUCT_STARTER` and
`DODO_PRODUCT_GROWTH` as in step 7, and re-run the deploy workflow so the API picks them up.

## 11. Check it

Open the Vercel URL, sign up, confirm your email, create a workspace, add a knowledge source,
and ask the assistant a question in the playground.

---

## Day-to-day

- **Logs:** `aws logs tail /groundline/prod --follow` (one stream per container), or
  CloudWatch → Log groups in the console.
- **Shell on the server** (no SSH needed):
  `aws ssm start-session --target "$(terraform output -raw instance_id)"`, then
  `cd /opt/groundline && sudo docker compose ps`.
- **Redeploy or roll back:** run the deploy workflow with any earlier commit SHA.
- **Changing a secret:** update it in Parameter Store, then re-run the deploy workflow.
- **Alarms:** a failed host is recovered automatically and an unresponsive instance
  rebooted; both email you. Another alarm warns when CPU credits run low (sustained load).
- **Backups:** Supabase Free has no point-in-time restore; for a showcase, an occasional
  `pg_dump` of the session-pooler URL is enough. Uploaded files are in S3.
- **OS updates:** security updates install automatically (`dnf-automatic`).

## Tearing it down

```bash
cd deploy/aws-ec2/terraform
aws s3 rm "s3://$(terraform output -raw uploads_bucket)" --recursive
terraform destroy
```

Then delete the Vercel project and Supabase project if you no longer need them.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Deploy fails at "Pulling images" with `denied` or `unauthorized` | The GHCR packages are still private (step 9.1), or CI hasn't published that commit yet. |
| `api` restarts with `Invalid environment configuration` | A required secret is still `-`, e.g. `SUPABASE_ANON_KEY` or `DATABASE_URL`. |
| Migrations fail with a TLS or "self-signed certificate" error | The `?sslmode=...` suffix doesn't match the table in step 4 for that URL. |
| The API URL shows a certificate error | Caddy couldn't get a certificate: check the A record (custom domain), and `docker compose logs caddy` on the server. Port 80 must stay open for Let's Encrypt. |
| Sign-in works but email links fail | Supabase Redirect URLs don't include `<Vercel URL>/auth/callback**`. |
| Pages on Vercel show "Groundline is temporarily unavailable" | `API_URL` in Vercel is wrong, or the backend is down (`aws logs tail`). |
