# MedStock

B2B medicine procurement directory for medical stores and pharmacies. The MVP scope and engineering rules live in `AGENTS.md`. Architecture choices live in `docs/decisions.md`.

This repository is a pnpm workspace:

- `apps/web` — Next.js App Router
- `apps/api` — NestJS REST API
- `packages/shared-types` — Zod contracts shared by the web app and the API
- `packages/database` — Prisma schema and client
- `infrastructure/docker` — local PostgreSQL and Redis

## Prerequisites

- Node.js 26.13.0 (`nvm use` reads `.nvmrc`)
- pnpm 9.15.4
- Docker, for local PostgreSQL and Redis

## Local setup

```bash
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d
cp .env.example .env
pnpm dev
```

The web app runs on port 3000 and the API on port 3001. Copy `.env.example` to `.env` and replace values outside the local Compose defaults. Do not commit secrets.

The API serves liveness and readiness checks, identity routes, the canonical medicine catalog, distributor listings, enquiries, and manual listing imports. Staging configuration is in `docs/deployment.md`. The web app signs in through Cognito and keeps the session in an HttpOnly cookie. Catalog rules are in `docs/catalog.md`. Listing rules are in `docs/listings.md`. Enquiry rules are in `docs/enquiries.md`. Import rules are in `docs/imports.md`. Authentication rules are in `docs/authentication.md`. Secret handling and the security checklist are in `docs/security.md`. Cognito access-token verification is configured with `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, and `COGNITO_CLIENT_ID`. See `apps/api/README.md`. Database setup is in `packages/database/README.md`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
