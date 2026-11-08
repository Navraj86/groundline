# Deploying Groundline from the AWS console

This guide sets Groundline up entirely through web interfaces: the AWS console, Supabase,
Vercel and GitHub. No Terraform or command line is needed. It costs about **US$15–20 a month**
on AWS; everything else uses free tiers. (Prefer automation? [deploy-aws-terraform.md](deploy-aws-terraform.md)
builds the same setup with Terraform.)

```
 Browser ──▶ Vercel (free): Next.js web app
                 │ HTTPS
                 ▼
 AWS EC2 t4g.small, Docker Compose ── Elastic IP, HTTPS by Caddy + Let's Encrypt
   caddy ─▶ api ─▶ ai          worker          redis
             └───────┴──▶ Supabase (free): Postgres + pgvector, sign-in
                     └──▶ AWS S3: uploaded files
 Settings and secrets: Parameter Store · Logs: CloudWatch · Spend alert: AWS Budgets
 Deploys: GitHub Actions or Systems Manager Run Command (no SSH)
```

Files you'll copy from are in [`deploy/aws-ec2/console`](../deploy/aws-ec2/console) and
[`deploy/aws-ec2/host/user-data.sh`](../deploy/aws-ec2/host/user-data.sh). Open them on GitHub
and use the copy button.

Plan on 60–90 minutes. Keep a note of the values marked **Save:** as you go.

## What it costs

| Item | Monthly (approx.) |
| --- | --- |
| EC2 `t4g.small` (2 vCPU, 2 GB) | US$10–13, by region |
| Public IPv4 address (Elastic IP) | US$3.65 |
| 20 GB disk | about US$1.75 |
| S3, CloudWatch, Parameter Store, Budgets | under US$1 |
| Vercel, Supabase, GitHub Container Registry, Let's Encrypt | free |
| **Total** | **about US$15–20** |

---

## Part A: Your AWS account

### A1. Create the account

Go to https://aws.amazon.com and choose **Create an AWS account**.

> **AWS Builder ID is not an AWS account.** A Builder ID is a personal profile for tools
> such as Amazon Q Developer, Skill Builder and re:Post. It can't create servers. You need a
> regular AWS account (you can use the same email for both).

During sign-up AWS asks you to choose a plan. New accounts receive promotional credits on
either one; the details are shown on the sign-up page, and AWS sends a summary by email.

- **Free plan:** you're never charged; usage comes out of the credits. The account is closed
  if you don't upgrade before the plan ends (about six months), so upgrade from the Billing
  console when you want to keep the site running.
- **Paid plan:** usage comes out of the credits first, then is billed normally.

Either works for this guide. If sign-up offers a **spending limit**, set it to US$25.

> **The new project-based console.** Accounts created with AWS's newer sign-up open on a
> *Console Home | <project name>* page with **Manage projects / Manage team / Manage billing**.
> There, each project is its own AWS account, you sign in through the AWS access portal
> (IAM Identity Center is set up for you, and that's fine on the Free plan), and:
>
> - New accounts may be limited to **one project**; put Groundline in the existing one.
> - A project is **locked to one region** (shown under *Manage projects → Additional info*).
>   Use that region everywhere below, and pick the same region for Supabase.
> - Skip A2: your sign-in is already a non-root user.
> - **CloudShell** can stay unavailable for up to two days while a new account is verified.
>   Generate the keys in C7 on the server instead (see there).
>
> With the classic sign-up, don't turn on AWS Organizations or IAM Identity Center yourself
> on the Free plan: doing so moves the account to the Paid plan.

### A2. Secure the account

1. Signed in as the root user (the email you signed up with), open your account name (top
   right) → **Security credentials** → **Assign MFA device**, and add an authenticator app.
2. Create a day-to-day admin user: search for **IAM** → **Users** → **Create user**.
   - User name `groundline-admin`; tick **Provide user access to the AWS Management Console**,
     choose **I want to create an IAM user**, and set a password.
   - Permissions: **Attach policies directly** → `AdministratorAccess`.
   - After creating it, open the user → **Security credentials** → **Assign MFA device**.
3. On the IAM **Dashboard**, copy the **Sign-in URL for IAM users**, sign out, and sign back
   in there as `groundline-admin`. Use this user from now on and keep the root user for billing.

### A3. Pick a region

Use the region selector at the top right of the console, e.g. **Asia Pacific (Mumbai)
ap-south-1**. Create everything below in this one region, ideally the same region as your
Supabase project. **Save:** the region code.

Your 12-digit account ID is in the account menu (top right). **Save:** account ID.

### A4. Budget alert

**Billing and Cost Management → Budgets → Create budget**:

- **Use a template** → **Monthly cost budget**.
- Budget amount **25** (USD), and your email as recipient.

AWS emails you as the month's spend approaches and passes that amount.

---

## Part B: Free services

### B1. Supabase (database and sign-in)

1. At https://supabase.com create a project in a region near your AWS region. **Save:** the
   database password.
2. **Database → Extensions:** enable **vector**.
3. **Connect** (top bar) → **Session pooler**: copy the URI, replacing `[YOUR-PASSWORD]`
   (URL-encode special characters). **Save:** it; you'll use it three times in Part D.
4. **Project Settings → API Keys:** **Save:** the **publishable** key (`sb_publishable_...`),
   or the **anon** key on older projects. **Project Settings → JWT Keys:** if a **legacy JWT
   secret** is listed, you may **Save:** it, but it's optional: new projects sign sign-in tokens
   with ES256 keys, which the API verifies against the project's public keys either way.
5. **Project URL** (Project Settings → Data API): **Save:** it. Your Supabase Auth URL is
   that URL followed by `/auth/v1`.

### B2. Email

Any SMTP service works; Resend (3,000 emails a month free) is the simplest. Create an API key
and **Save:** `smtps://resend:<API key>@smtp.resend.com:465`. In Supabase, **Authentication →
Emails → SMTP Settings**, enter the same server details (Supabase's built-in email only sends
a few messages an hour).

### B3. Vercel (web app)

1. At https://vercel.com: **Add New → Project**, import the GitHub repository.
2. **Root Directory:** `apps/web`. Leave the other settings; `apps/web/vercel.json` provides
   them. **Deploy**.
3. **Save:** the URL, e.g. `https://groundline.vercel.app`. Pages that need the API show
   errors until Part F.

### B4. Make the images public

CI publishes Docker images to GitHub Container Registry. The server pulls them without
logging in, so on GitHub open your profile → **Packages** → for each of `groundline/api`,
`groundline/ai` and `groundline/migrate`: **Package settings → Change visibility → Public**.

---

## Part C: AWS resources

### C1. S3 bucket for uploads

**S3 → Create bucket**:

- **Bucket name:** something unique, e.g. `groundline-uploads-<your account ID>`.
- Keep **Block all public access** on and default encryption (**SSE-S3**).

**Save:** the bucket name exactly as the bucket list shows it. Newer accounts append the
account and region, e.g. `groundline-uploads-123456789012-ap-southeast-2-an`; use that full
name everywhere.

### C2. Log group

**CloudWatch → Logs → Log groups → Create log group**: name `/groundline/prod`, retention
**2 weeks**.

### C3. Permissions for the server

1. **IAM → Policies → Create policy → JSON.** Paste
   [`instance-policy.json`](../deploy/aws-ec2/console/instance-policy.json) and replace
   `YOUR_BUCKET_NAME`, `YOUR_REGION` and `YOUR_ACCOUNT_ID`. Name it `GroundlineInstanceAccess`.
2. **IAM → Roles → Create role:** trusted entity **AWS service**, use case **EC2**. Attach
   `AmazonSSMManagedInstanceCore` and `GroundlineInstanceAccess`. Name it
   `groundline-prod-instance`.

`AmazonSSMManagedInstanceCore` lets you open a shell and run deploys from the console without
SSH; the other policy lets the server use the bucket, read its settings and write logs.

### C4. Launch the server

**EC2 → Instances → Launch instances**:

| Setting | Value |
| --- | --- |
| Name | `groundline-prod` |
| Application and OS Images | **Amazon Linux 2023 AMI**, architecture **64-bit (Arm)** |
| Instance type | `t4g.small` |
| Key pair | **Proceed without a key pair** (you'll use Session Manager) |
| Network settings → **Edit** | Default VPC, **Auto-assign public IP: Enable**. **Create security group** named `groundline-api`. **Remove** the SSH rule; add **HTTP** and **HTTPS**, source **Anywhere** |
| Configure storage | **20 GiB gp3**; under **Advanced**, set **Encrypted: Yes** |
| Advanced details → IAM instance profile | `groundline-prod-instance` |
| Advanced details → Credit specification | **Standard** (avoids extra charges under sustained load) |
| Advanced details → Metadata version | **V2 only (token required)** |
| Advanced details → Metadata response hop limit | **2** (so containers can use the server's role) |
| Advanced details → User data | paste all of [`user-data.sh`](../deploy/aws-ec2/host/user-data.sh) |

**Launch instance.** Setup takes about three minutes. **Save:** the instance ID (`i-...`).

### C5. Fixed IP address

**EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**, then **Actions → Associate
Elastic IP address**, choose the instance, **Associate**. **Save:** the IP.

Your API's free hostname is the IP with dashes plus `.sslip.io`: for `13.233.10.5` it's
`13-233-10-5.sslip.io`. (With your own domain, create an **A record** such as
`api.example.com` pointing at this IP and use that instead.) **Save:** API hostname.

### C6. Automatic recovery alarms

**EC2 → Instances →** select the instance → **Actions → Monitor and troubleshoot → Manage
CloudWatch alarms → Create an alarm**:

1. **Alarm notification:** create a new SNS topic with your email.
   **Alarm action:** **Recover**. **Metric:** *Status check failed: system*. Create.
2. Repeat with **Alarm action: Reboot** and metric *Status check failed: instance*.

The newer form shows **Alarm when: Failing** instead of a threshold box; that's expected. A red
**Warning** next to *Actions enabled* usually means the SNS email subscription isn't
confirmed yet.

Confirm the subscription email AWS sends you.

### C7. Settings and secrets

First, generate the four internal keys. Open **CloudShell** (the terminal icon in the console's
top bar, free), or, if CloudShell says your account verification is in progress, a terminal on
the server (C8: **Connect → SSM Session Manager**), and run:

```bash
for k in AI_SERVICE_TOKEN WIDGET_TOKEN_SECRET PROXY_SECRET; do echo "$k=$(openssl rand -hex 24)"; done
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
```

**Save:** the four values (`PROXY_SECRET` is needed again in Part F).

Then **Systems Manager → Parameter Store → Create parameter** for each row. Use tier
**Standard** (free).

**Settings:** one parameter named `/groundline/prod/config`, type **String**. Copy
[`config.env`](../deploy/aws-ec2/console/config.env), replace the placeholders (API hostname,
email, Vercel URL, Supabase Auth URL, region, bucket), and paste it as the value.

**Secrets:** one **SecureString** parameter per row, named `/groundline/prod/secrets/<NAME>`:

| NAME | Value |
| --- | --- |
| `AI_SERVICE_TOKEN`, `WIDGET_TOKEN_SECRET`, `PROXY_SECRET`, `ENCRYPTION_KEY` | from CloudShell |
| `DATABASE_URL` | Supabase URI + `?sslmode=require&uselibpqcompat=true` |
| `MIGRATE_DATABASE_URL` | Supabase URI + `?sslmode=require` |
| `AI_DATABASE_URL` | Supabase URI + `?sslmode=require` |
| `SUPABASE_ANON_KEY` | from B1 |
| `SUPABASE_JWT_SECRET` | from B1 (skip if your project has none) |
| `SMTP_URL` | from B2 |
| `DEEPSEEK_API_KEY` and/or `OPENAI_API_KEY` | at least one |

Skip any you don't have yet (payments come in Part G).

**No OpenAI key?** The knowledge base needs an embeddings provider to index documents, and
DeepSeek doesn't offer one. Add an OpenAI key (embeddings cost about US$0.02 per million
tokens), or add the line `EMBEDDINGS_PROVIDER=fake` to `/groundline/prod/config` for free
word-matching search: it works when questions use the same words as the documents. If you add
an OpenAI key later, remove that line, deploy, and click **Reprocess** on each source. Values can't contain a single quote.
Never change `ENCRYPTION_KEY` once the app is in use: stored connector secrets depend on it.

### C8. Check the server

**Systems Manager → Fleet Manager** should list the instance as **Online** (allow a few
minutes after launch). To look inside: **EC2 → Instances →** select it **→ Connect**, choose
the **SSM Session Manager** card (not *EC2 Instance Connect*, which needs the SSH port you
closed) **→ Connect**, then run `docker compose version` and `cat /etc/groundline.conf`.

---

## Part D: First deploy (from the console)

1. On GitHub, open the repository's **Commits**, and copy the full SHA of the latest commit
   on `main` whose CI run is green (the copy button next to the commit).
2. **Systems Manager → Run Command → Run command:**
   - Command document: **AWS-RunShellScript**.
   - Commands: `groundline-deploy <the SHA>`.
   - Targets: **Choose instances manually** → your instance.
   - **Run.**
3. Open the command and the instance's **Output**. You'll see it pull the images, run the
   database migrations, start the containers and wait for the API. **Success** means the API is
   live at `https://<API hostname>/health`.

To deploy a later version, repeat with a newer SHA, or set up automatic deploys (Part E).

## Part E: Automatic deploys from GitHub (optional)

Every green build on `main` can deploy itself. GitHub signs in to AWS without stored keys.

1. **IAM → Identity providers → Add provider:** type **OpenID Connect**, provider URL
   `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`. **Add provider.**
2. **IAM → Roles → Create role → Custom trust policy:** paste
   [`github-deploy-trust.json`](../deploy/aws-ec2/console/github-deploy-trust.json), replacing
   `YOUR_ACCOUNT_ID` (and the repository name if yours differs). Skip adding permissions; name
   the role `groundline-prod-github-deploy`.
3. Open the new role → **Add permissions → Create inline policy → JSON:** paste
   [`github-deploy-policy.json`](../deploy/aws-ec2/console/github-deploy-policy.json) with your
   region, account ID and instance ID. Name it `deploy-via-ssm`. The role can now do exactly one
   thing: run commands on this server. **Save:** the role ARN.
4. On GitHub: **Settings → Environments → New environment** `production`, then add
   **Environment variables** `AWS_DEPLOY_ROLE_ARN` (the ARN), `AWS_REGION` and
   `AWS_INSTANCE_ID`. Add yourself under **Required reviewers** if you want to approve each
   deploy.
5. Test it: **Actions → Deploy backend to AWS (EC2) → Run workflow**, with a commit SHA.

## Part F: Connect the web app

1. **Vercel → Project → Settings → Environment Variables** (Production):
   `API_URL` = `https://<API hostname>`, `PUBLIC_WEB_URL` = your Vercel URL,
   `PROXY_SECRET` = the value from CloudShell. Then **Deployments → ⋯ → Redeploy**.
2. **Supabase → Authentication → URL Configuration:** **Site URL** = your Vercel URL; add
   `<Vercel URL>/auth/callback**` under **Redirect URLs**.
3. Open the Vercel URL, sign up, confirm your email, create a workspace, add a knowledge
   source and try the assistant.

## Part G: Payments (when you need them)

In Dodo Payments (test mode), add a webhook to `https://<API hostname>/webhooks/dodo`. Add the
SecureString parameters `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`,
`DODO_PRODUCT_STARTER` and `DODO_PRODUCT_GROWTH`, then deploy again (Part D or E) so the API
reads them.

---

## Running it, from the console

| Task | Where |
| --- | --- |
| Read logs | **CloudWatch → Log groups → `/groundline/prod`**: one stream per container (`api`, `worker`, `ai`, `caddy`, `redis`). |
| Open a shell | **EC2 → Instance → Connect → Session Manager**, then `cd /opt/groundline && sudo docker compose ps` |
| Change a secret | **Parameter Store →** the parameter **→ Edit**, then deploy again. |
| Deploy or roll back | **Run Command** with any commit SHA (Part D), or the GitHub workflow. A deploy whose API doesn't come up rolls back by itself. |
| Watch spend | **Billing and Cost Management → Bills**, and **Credits** for what's left of the free credits. |
| Pause to save money | **EC2 → Instance state → Stop.** Compute stops billing; the disk and IP (about US$5 a month) still do. **Start** it again later. |

Free-tier limits: Supabase Free pauses a project after a week of inactivity and holds 500 MB;
Vercel Hobby limits request bodies to 4.5 MB, so knowledge-base file uploads are limited to
about 4 MB there.

## Removing everything

1. **EC2:** terminate the instance; then **Elastic IPs → Release** (an unattached IP is still
   billed).
2. **S3:** empty the bucket, then delete it.
3. **Parameter Store:** delete the `/groundline/prod/...` parameters.
4. **CloudWatch:** delete the log group and the two alarms; **SNS:** delete the topic.
5. **IAM:** delete the two roles, the policy, and the GitHub identity provider.
6. **Budgets:** delete the budget if you're closing the account.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Instance not in Fleet Manager | The role from C3 isn't attached (Instance → Actions → Security → Modify IAM role), or setup is still running. |
| Run Command fails at "Pulling images" (`denied`) | The packages aren't public yet (B4), or CI hasn't published that commit. |
| API keeps restarting (`Invalid environment configuration` in the `api` log) | A required parameter is missing, e.g. `SUPABASE_ANON_KEY` or `DATABASE_URL`. |
| Migrations fail with a TLS error | The `?sslmode=...` suffix doesn't match the table in C7. |
| Certificate error on the API hostname | Caddy couldn't get a certificate: check the `caddy` log stream. Port 80 must stay open, and a custom domain's A record must point at the Elastic IP. |
| Email links don't sign you in | Supabase Redirect URLs are missing `<Vercel URL>/auth/callback**`. |
| "Region … unavailable" in the console | Your project is locked to another region: use the region from *Manage projects → Additional info*. |
| Adding knowledge fails with "Embeddings aren't configured" | No `OPENAI_API_KEY`; add one or set `EMBEDDINGS_PROVIDER=fake` (C7). |
| Visiting a `groundline-xxxx-….vercel.app` address behaves differently | That's one specific build. Use the project's main address, which always serves the latest. |
| Vercel pages say Groundline is unavailable | `API_URL` is wrong, or the backend is down (check the logs). |
