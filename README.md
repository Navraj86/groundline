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
| 2 | Subscriptions and Dodo Payments | Planned |
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
| `apps/api` | NestJS core API: auth (proxying Supabase Auth), organizations, members, invitations, audit log. System of record. |
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

### Roles

| Role | Can |
| --- | --- |
| Owner | Everything, including billing, integrations and workspace settings |
| Admin | Manage the team, knowledge base, conversations and support settings |
| Support agent | Handle conversations and tickets |
| Viewer | Read dashboards and reports |

Admins can't grant, change or remove the Owner role, and a workspace always keeps at least one owner.

## Getting started

Requirements: Node.js 24+, pnpm 10, Docker, and [uv](https://docs.astral.sh/uv/) for the AI service.

```bash
pnpm install
cp .env.example .env    # then set SUPABASE_JWT_SECRET and AUTH_DB_PASSWORD
pnpm infra:up           # Postgres, Redis, Supabase Auth, Mailpit
pnpm db:migrate         # apply Prisma migrations
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
