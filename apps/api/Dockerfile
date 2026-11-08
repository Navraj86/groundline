# syntax=docker/dockerfile:1.7
# Groundline core API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t groundline-api .
#   docker build -f apps/api/Dockerfile --target migrate -t groundline-migrate .
#
# Targets:
#   runtime (default)  the API; also the background worker with `node dist/worker.js`
#   migrate            applies database migrations and seeds the plan catalog, then exits

ARG NODE_VERSION=24.11.1

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate
WORKDIR /repo

# Only the API and the packages it depends on, with a matching pruned lockfile.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @groundline/api --out-dir=/out

FROM base AS build
# Amazon RDS certificate authorities, so database connections can verify the server.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds/global-bundle.pem
COPY --from=prune /out/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@groundline/api
# A self-contained copy of the API with production dependencies only.
RUN pnpm --filter @groundline/api deploy --prod --legacy /prod/api

FROM build AS migrate
WORKDIR /repo/apps/api
USER node
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts"]

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production API_PORT=4000
COPY --from=build /etc/ssl/rds /etc/ssl/rds
WORKDIR /app
COPY --from=build --chown=node:node /prod/api/package.json ./
COPY --from=build --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=build --chown=node:node /prod/api/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/main.js"]
