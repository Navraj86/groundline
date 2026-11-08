# Groundline

AI customer support that answers from your own documentation, takes approved actions,
and hands off to your team when it should.

Groundline is a multi-tenant SaaS platform. Each company gets its own workspace with a
knowledge base, an embeddable chat agent, support tickets, analytics, and human approval for
sensitive agent actions. See [docs/requirements.md](docs/requirements.md) for the full
business requirements.

## Status

Built in phases (see the roadmap in the requirements doc).

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Auth, organizations, roles, invitations, dashboard, database foundation | ✅ Done |
| 2 | Subscriptions, plan limits and Dodo Payments | ✅ Done |
| 3 | Knowledge-base ingestion, embeddings, RAG chat widget | ✅ Done |
| 4 | Tickets, agent tool calling, human approval | ✅ Done |
| 5 | Analytics, evaluations, background workers | ✅ Done |
| 6 | Docker images, CI/CD, AWS deployment | In progress (CI) |

## Architecture

```
            ┌──────────────┐     server-side fetch      ┌──────────────┐
 browser ──▶│  apps/web    │ ─────────────────────────▶ │  apps/api    │──▶ Postgres + pgvector
            │  Next.js 16  │   (httpOnly session        │  NestJS 12   │──▶ Redis
            └──────────────┘    cookies, BFF pattern)   │  Prisma 7    │──▶ Supabase Auth (GoTrue)
                                                        └──────┬───────┘──▶ SMTP
                                                               │
                                                        ┌──────▼───────┐
                                                        │  apps/ai     │──▶ OpenAI (answers, embeddings)
                                                        │  FastAPI     │──▶ DeepSeek (answer fallback)
                                                        └──────────────┘──▶ S3 (uploaded files)
 customer site ──▶ widget.js ──▶ iframe /widget/[key] ──▶ /api/widget/* ──▶ apps/api /widget/*
```

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js App Router frontend: landing page, auth flows, workspace dashboard. Talks only to the API, from the server. |
| `apps/api` | NestJS core API: auth (proxying Supabase Auth), organizations, members, invitations, billing, tickets, agent tools, analytics, evaluations, audit log. System of record. Also runs the BullMQ workers (in-process, or as `dist/worker.js`). |
| `apps/ai` | Python FastAPI service: document ingestion worker, pgvector retrieval, grounded answers with OpenAI (DeepSeek fallback). |
| `packages/shared` | Roles, permissions, zod schemas and API types shared by web and API. |
| `infra` | Database init scripts for the local Docker stack. |

### Key decisions

- **Supabase Auth for identity, our database for everything else.** The API verifies Supabase
  JWTs locally (HS256 secret or JWKS) and keeps an application profile per user. Locally the
  Supabase Auth server (GoTrue) runs in Docker against the same Postgres, so there is no cloud
  dependency for development.
- **The browser never holds tokens.** The web app stores the session in httpOnly cookies and
  calls the API server-side. `proxy.ts` refreshes access tokens before they expire.
- **Tenant isolation at the API boundary.** Every organization-scoped route goes through
  `OrgAccessGuard`, which resolves the caller's membership from `:orgId` and enforces a
  permission from the shared role map. Non-members get `404`, so IDs can't be probed.
- **Audit everything administrative.** Membership, role, invitation and settings changes are
  written to `audit_logs` inside the same transaction as the change.
- **Invitations are bearer secrets.** Tokens are random 256-bit values, stored only as SHA-256
  hashes, single-use, expiring, and bound to the invited email address.

- **Answers come only from the customer's own knowledge.** Retrieval is scoped to the
  organization and filtered by relevance. With nothing relevant, the assistant says so and offers
  a human without calling a model. Sources are passed as fenced, numbered data (instructions inside
  them are ignored), answers cite them as `[n]`, and the model replies `NO_ANSWER` rather than
  guessing. Deleting a source cascades its chunks out of retrieval immediately.
- **Postgres is the ingestion queue.** New sources are claimed with `FOR UPDATE SKIP LOCKED`, the
  worker wakes on `NOTIFY knowledge_ingest`, chunks are swapped atomically, and temporary failures
  retry with backoff. Website fetches are checked hop by hop against private addresses (SSRF).
- **Provider fallback.** Answers go to OpenAI through the Responses API; on outages, rate limits or
  errors the same request goes to DeepSeek's compatible API. Each reply records provider, model,
  tokens and latency.
- **Billing state is a projection of the payment provider.** Subscriptions and payments change
  only from verified Dodo Payments webhooks (or an explicit reconciliation fetch). Each delivery
  is stored by `webhook-id` and applied in the same transaction that marks it processed, so
  retries and replays take effect once; events older than the state already applied are skipped.

### Roles

| Role | Can |
| --- | --- |
| Owner | Everything, including billing, integrations and workspace settings |
| Admin | Manage the team, knowledge base, conversations and support settings |
| Support agent | Handle conversations and tickets |
| Viewer | Read dashboards and reports |

Admins can't grant, change or remove the Owner role, and a workspace always keeps at least one owner.

## Knowledge base and chat

1. **Knowledge base:** upload PDFs, text or Markdown (up to 20 MB), add web pages, or paste text.
   The AI service extracts text, splits it into overlapping ~1,200-character passages, embeds them
   with `text-embedding-3-small` and stores them in `ai.knowledge_chunks` (pgvector, HNSW).
2. **Assistant:** set its name, greeting, tone instructions and brand color, then copy the embed
   snippet:

   ```html
   <script src="https://your-groundline-host/widget.js" data-groundline-key="wk_..." async></script>
   ```

3. **Conversations:** every chat is stored with the sources behind each answer. Customers can ask
   for a person; once a conversation is escalated the AI stops replying and your team answers from
   the inbox.

Each widget conversation counts once against the plan's monthly AI conversation limit.

## Tickets, agent tools and approvals

- **Tickets** are numbered per workspace (#1001, …) with status, priority, assignee, internal notes
  and a full history. They're opened when a customer asks for a person, when the assistant uses
  `create_ticket`, or by staff.
- **Agent tools:** `create_ticket`, `get_customer_profile`, `get_subscription`, `list_orders`,
  `request_refund`, `cancel_subscription`. The AI service only *proposes* tool calls; the API's
  `ToolExecutor` runs a call only if the tool is registered and enabled, the input validates, and,
  for account tools, the conversation belongs to a **verified customer**. Everything else is
  blocked, and every call is logged with its input, result and timing.
- **Approvals:** refunds and cancellations never run directly. They become approval requests that
  only owners and admins can approve; approval runs the action and posts the outcome to the
  customer's chat. Requests expire after 72 hours.
- **Identity verification:** your server signs a short-lived HS256 JWT (`sub`, `email`, `name`) with
  the workspace's identity secret and passes it to the widget (`data-user-token` or
  `window.Groundline.identify(token)`). Account tools act for that customer only.
- **Connectors:** a built-in **sandbox store** (deterministic demo customers, orders and
  subscriptions) and the **Actions API**, which calls your backend at `POST {baseUrl}/{action}` with
  an `X-Groundline-Signature: t=…,v1=HMAC-SHA256(secret, "t.body")` header. Base URLs must be public
  https addresses in production. Identity and signing secrets are encrypted at rest (AES-256-GCM).

## Analytics

`/o/<workspace>/analytics` reports on any date range, in the viewer's time zone:

- **Conversations:** total, customer messages, how many the assistant resolved without a
  hand-off (AI resolution rate), and how many were escalated, with a per-day chart.
- **Answers:** answered, not in the knowledge base, failed, and reply time (average, median, p90).
- **Tickets:** created by source, resolved, open now, and median time to resolve.
- **Agent:** runs, tool calls with success rates, and approval outcomes and turnaround.
- **AI usage and cost:** tokens per model with an estimated cost from list prices
  (`AI_MODEL_PRICES` overrides them), including quality reviews and evaluation runs.
- **Answer quality:** average groundedness and relevance of reviewed answers, with links to
  flagged ones.

Conversation figures cover the website widget; playground tests are excluded, though their
cost is not. Reports are cached in Redis for a minute.

## Answer quality and evaluations

- **Hallucination monitoring.** A share of live answers (`ANSWER_REVIEW_SAMPLE_RATE`, default
  25%) is checked by a background job against the full text of the sources it cited. An
  LLM judge scores groundedness and relevance and lists unsupported claims. Answers below 60%
  grounded are flagged on the conversation and in analytics.
- **Evaluation datasets.** Questions with an optional expected answer and expected sources,
  or marked "should decline". A built-in **Guardrails** set covers off-topic requests,
  prompt injection and requests for other people's data.
- **Runs** answer every question the way the live assistant would (without account tools),
  then score relevance, groundedness, correctness against the expected answer, retrieval hit
  rate and MRR, and decline accuracy. Runs execute in a worker, resume after a crash, can be
  cancelled, and are kept with the prompt version, model and judge that produced them, so
  results can be compared over time.
- Without a language model configured, a word-overlap heuristic stands in for the judge, and
  results say so.

## Background jobs

BullMQ queues on Redis: `evaluations`, `answer-reviews` and `maintenance` (expiring overdue
approvals every five minutes). By default the API process also runs the workers; in
production run the API with `WORKERS_ENABLED=false` and scale `pnpm --filter @groundline/api
start:worker` separately. Jobs retry with exponential backoff, and `/health/ready` reports
Redis and queue depth. Document ingestion stays in the AI service's own worker, woken by
Postgres `NOTIFY`.

## Billing

Plans live in the `plans` table (seeded by `pnpm db:seed`) with their prices, limits and Dodo
Payments product ids, so they can change without a deploy.

| Plan | Price | Team members | Knowledge sources | AI conversations / month |
| --- | --- | --- | --- | --- |
| Free | $0 | 2 | 5 | 100 |
| Starter | $29 | 5 | 50 | 2,000 |
| Growth | $99 | 20 | 500 | 10,000 |

- **Checkout:** owners pick a plan; the API creates the workspace's Dodo customer, then a hosted
  checkout carrying the organization id in metadata. On return, the web app asks the API to
  reconcile so the new plan shows even before the webhook lands.
- **Changes:** upgrades and downgrades call Dodo's change-plan API (`difference_immediately`,
  keeping the old plan if the charge fails). Switching to Free cancels at period end.
- **Limits:** `EntitlementsService` applies the paid plan while the subscription is active or in
  its grace period (`PAST_DUE`) and Free otherwise. Exceeding a limit returns `402` with
  `code: "plan_limit_reached"`. Pending invitations count as seats.

### Setting up Dodo Payments

1. In the Dodo Payments dashboard (test mode), create two monthly subscription products for
   Starter and Growth. Set a long subscription period (for example 20 years) with monthly
   payments so they renew.
2. Put the API key, webhook secret and product ids in `.env` (see `.env.example`), then run
   `pnpm db:seed` to attach the products to the plans.
3. Expose the API (for example `cloudflared tunnel --url http://localhost:4000`) and add
   `<tunnel>/webhooks/dodo` as a webhook endpoint.

Without an account, you can still exercise every billing state locally with signed simulated
webhooks:

```bash
DODO_PRODUCT_STARTER=pdt_local_starter DODO_PRODUCT_GROWTH=pdt_local_growth pnpm db:seed
pnpm --filter @groundline/api billing:simulate <org-slug> activate starter
pnpm --filter @groundline/api billing:simulate <org-slug> past-due
```

## Getting started

Requirements: Node.js 24+, pnpm 10, Docker, and [uv](https://docs.astral.sh/uv/) for the AI service.
Answers and embeddings need `OPENAI_API_KEY`; `DEEPSEEK_API_KEY` adds a fallback for answers.
Without an OpenAI key, run the AI service with `EMBEDDINGS_PROVIDER=fake` to try ingestion locally.

```bash
pnpm install
cp .env.example .env    # then set SUPABASE_JWT_SECRET and AUTH_DB_PASSWORD
pnpm infra:up           # Postgres, Redis, Supabase Auth, Mailpit
pnpm db:migrate         # apply Prisma migrations
pnpm --filter @groundline/api db:seed   # plan catalog
pnpm dev                # web :3000, api :4000, ai :8000 (runs its migrations and ingestion worker)
```

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| URL | Service |
| --- | --- |
| http://localhost:3000 | Web app |
| http://localhost:4000/health | API |
| http://localhost:8000/docs | AI service |
| http://localhost:8025 | Mailpit inbox (confirmation, reset and invitation emails) |
| http://localhost:9999 | Supabase Auth |
| http://localhost:9001 | Object storage console (RustFS) |

### Useful scripts

```bash
pnpm build        # build every package
pnpm lint         # oxlint (api), eslint (web), ruff (ai)
pnpm typecheck
pnpm test         # vitest (shared, api), pytest (ai)
pnpm db:studio    # browse the database with Prisma Studio
```

## API overview

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/auth/sign-up`, `/auth/sign-in`, `/auth/refresh` | Public, rate limited |
| `POST` | `/auth/forgot-password`, `/auth/resend-confirmation` | Public, no account enumeration |
| `POST` | `/auth/reset-password`, `/auth/sign-out` | Authenticated |
| `GET/PATCH` | `/me` | Profile and memberships |
| `POST` | `/orgs` | Create a workspace (caller becomes owner) |
| `GET/PATCH` | `/orgs/:orgId` | `org:read` / `org:update` |
| `GET` | `/orgs/:orgId/overview` | Stats and recent activity |
| `GET` | `/orgs/:orgId/audit-logs` | `audit:read`, cursor pagination |
| `GET/PATCH/DELETE` | `/orgs/:orgId/members[/:memberId]` | Role hierarchy enforced |
| `GET/POST/DELETE` | `/orgs/:orgId/invitations[/:id]` | `members:manage` |
| `GET` | `/invitations/:token` | Public preview |
| `POST` | `/invitations/:token/accept` | Must be signed in as the invited email |
| `GET` | `/plans` | Public plan catalog |
| `GET` | `/orgs/:orgId/billing`, `/orgs/:orgId/billing/payments` | `billing:read` |
| `POST` | `/orgs/:orgId/billing/checkout`, `/change-plan`, `/cancel`, `/resume`, `/portal` | `billing:manage` (owners) |
| `POST` | `/orgs/:orgId/billing/sync` | Reconcile with Dodo Payments |
| `POST` | `/webhooks/dodo` | Signature-verified, idempotent |
| `GET/POST/PATCH` | `/orgs/:orgId/tickets[/:number[/notes]]` | Staff |
| `GET/POST` | `/orgs/:orgId/approvals`, `/approvals/:id/decision` | Read: staff · decide: owners and admins |
| `GET/PATCH` | `/orgs/:orgId/agent/tools`, `GET /agent/tool-calls` | Tool settings and call log |
| `GET/PUT/POST/DELETE` | `/orgs/:orgId/integrations/*`, `/orgs/:orgId/identity` | Owners |
| `GET/POST/PATCH/DELETE` | `/orgs/:orgId/knowledge[/files\|urls\|text\|:id[/reprocess]]` | Knowledge sources |
| `GET/PATCH/POST` | `/orgs/:orgId/assistant[/rotate-key]` | Assistant settings and widget key |
| `GET/POST/PATCH` | `/orgs/:orgId/conversations[/:id[/messages]]` | Inbox, team replies, resolve |
| `GET/POST` | `/widget/:key`, `/widget/:key/conversations` | Public: config, start a chat |
| `GET/POST` | `/widget/conversations/:id[/messages\|escalate]` | Public, visitor token required |
| `GET` | `/orgs/:orgId/analytics?from&to&tz` | Everyone in the workspace |
| `GET/POST/PATCH/DELETE` | `/orgs/:orgId/evaluations/datasets[/:id[/cases[/import\|:caseId]]]` | Read: everyone · manage: owners and admins |
| `POST` | `/orgs/:orgId/evaluations/datasets/from-template`, `/datasets/:id/runs` | Owners and admins |
| `GET/POST` | `/orgs/:orgId/evaluations/runs[/:runId[/cancel]]` | Run history and results |
| `GET` | `/health`, `/health/ready` | Liveness; readiness with database, Redis and queues |
