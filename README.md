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
| 3 | Knowledge-base ingestion, embeddings, RAG chat widget | Planned |
| 4 | Tickets, agent tool calling, human approval | Planned |
| 5 | Analytics, evaluations, background workers | Planned |
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
                                                        │  apps/ai     │  ingestion, retrieval,
                                                        │  FastAPI     │  LLM + agent orchestration
                                                        └──────────────┘
```

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js App Router frontend: landing page, auth flows, workspace dashboard. Talks only to the API, from the server. |
| `apps/api` | NestJS core API: auth (proxying Supabase Auth), organizations, members, invitations, billing, audit log. System of record. |
| `apps/ai` | Python FastAPI service for AI workloads (ingestion, RAG, agents). Scaffolded; filled in from Phase 3. |
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

```bash
pnpm install
cp .env.example .env    # then set SUPABASE_JWT_SECRET and AUTH_DB_PASSWORD
pnpm infra:up           # Postgres, Redis, Supabase Auth, Mailpit
pnpm db:migrate         # apply Prisma migrations
pnpm --filter @groundline/api db:seed   # plan catalog
pnpm dev                # web :3000, api :4000, ai :8000
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
