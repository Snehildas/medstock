# MedStock implementation plan

Status: planning only. No application features, scaffolds, or dependencies are introduced by this document.

This plan follows `AGENTS.md`. The two PDFs at the repository root are the earlier concept baseline. Where they disagree with `AGENTS.md`, the conflict is recorded below and must be resolved before schema or feature work.

## 1. Current repository state

The repository is a document set. There is no git history, package manager, application code, database schema, Docker setup, or environment template.

| Path | Role |
| --- | --- |
| `AGENTS.md` | Engineering constitution for MedStock. Filename previously had a trailing space (`AGENTS.md `), which made it invisible to normal path lookups. Renamed in this task; content unchanged. |
| `Project_MCDA_One_Page_Overview.pdf` | One-page concept: public and trade medicine search, admin masters, bulk import. Technology and data licensing left open. |
| `Pharmacy_Drug_Information_Platform_Project_Requirements_v2.pdf` | Version 2.0 functional baseline: modules, fields, workflows, proposed tables, phases, and unresolved research items. |
| `docs/implementation-plan.md` | This plan. |

`AGENTS.md` defines MedStock as a B2B procurement directory for Indian medical retailers. Retailers search and compare verified suppliers, then submit and track enquiries. Distributors register organizations and branches, submit verification information, manage listings, import CSV/XLSX inventory, and respond to enquiries. Platform admins verify organizations, maintain the canonical catalog, review import errors, and audit activity.

The locked stack is Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, NestJS REST, PostgreSQL, Prisma, Redis, BullMQ, Jest, Supertest, Playwright, Docker Compose, and AWS ECS/Fargate with RDS, S3, Secrets Manager, and CloudWatch. The backend is a modular monolith. Frontend and backend stay separate applications. Schema and shared contracts stay in packages.

## 2. Proposed monorepo structure

Use one pnpm workspace. pnpm is the package manager because it gives strict workspace isolation for two apps and two libraries without hoisting Nest or Prisma into the frontend. npm workspaces would also work; introducing both is unnecessary.

Package scope is `@medstock/*`. The workspace folder may remain `MCDA` until a remote repository name is chosen.

```text
MCDA/
  AGENTS.md
  package.json                 # private workspace root, scripts only
  pnpm-workspace.yaml          # apps/*, packages/*
  pnpm-lock.yaml
  tsconfig.base.json           # strict compiler options shared by every package
  .gitignore
  .nvmrc                       # one Node LTS version for local and CI
  .editorconfig
  apps/
    web/                       # @medstock/web — Next.js App Router
    api/                       # @medstock/api — NestJS modular monolith
  packages/
    database/                  # @medstock/database — Prisma schema, migrations, client
    shared-types/              # @medstock/shared-types — plain contracts
  infrastructure/
    docker/
      docker-compose.yml       # PostgreSQL and Redis for local development
    aws/                       # ECS/RDS/S3/Secrets Manager notes; no app code
  docs/
    implementation-plan.md
  Project_MCDA_One_Page_Overview.pdf
  Pharmacy_Drug_Information_Platform_Project_Requirements_v2.pdf
```

Leave the PDFs at the root. Moving them is a separate documentation decision and is not required to start the workspace.

### Dependency direction

```text
apps/web  -->  packages/shared-types
apps/api  -->  packages/shared-types
apps/api  -->  packages/database
packages/database  -->  (no workspace dependency)
packages/shared-types  -->  (no workspace dependency)
```

`apps/web` does not import Prisma. `packages/database` does not import Nest or Next. Generated Prisma files stay inside `packages/database` and are never edited by hand.

### `apps/web`

Next.js App Router and TypeScript, with Tailwind CSS and shadcn/ui added when the first screen is built. Route groups later separate retailer, distributor, and admin areas. The app calls the Nest API over HTTP. It does not own business rules or authorization.

### `apps/api`

NestJS REST API, one deployable modular monolith. Domain modules, added only when their feature is scheduled:

- `identity` — accounts, sessions, organization membership
- `organizations` — retailer and distributor organizations, branches, verification submission
- `catalog` — canonical medicines, salts, strengths, dosage forms, pack sizes, manufacturers
- `listings` — supplier-owned price, MOQ, stock status, and freshness
- `imports` — CSV/XLSX inventory jobs
- `procurement` — enquiries and supplier responses
- `admin` — organization verification, catalog governance, import-error review
- `audit` — catalog, inventory, verification, and procurement changes

Cross-cutting pieces live beside those modules: configuration, authentication guard, organization-scoped authorization, validation pipe, and logging that omits passwords, tokens, and other secrets.

### `packages/database`

Prisma schema, SQL migrations, and a small client export. Seed scripts, when added, live here and contain no secrets. PostgreSQL full-text search is the MVP search mechanism. A separate search service is out of scope.

### `packages/shared-types`

Hand-written TypeScript types for API contracts: request and response shapes, enums, and error codes used by both apps. Runtime validation uses one library, decided in task 0, so the API and the web app do not maintain two schema languages. Nest transport classes stay in `apps/api`. Prisma model types stay in `packages/database`.

### `infrastructure`

`infrastructure/docker/docker-compose.yml` runs PostgreSQL and Redis only. API and web processes run on the host during early development so rebuilds stay fast. Dockerfiles for the two apps are added when the ECS task definitions are written. `infrastructure/aws/` holds deployment notes and later task definitions. Application secrets come from environment variables locally and from Secrets Manager in AWS. Each app gets an `.env.example` with names and no values.

### Tooling kept at the root

Root scripts delegate to packages: `lint`, `typecheck`, `test`, and `build`. Jest and Supertest run inside `apps/api`. Playwright is added with `apps/web` when there is a user flow to test. ESLint and Prettier are workspace-level once the first package exists. TypeScript `strict` is on in `tsconfig.base.json`, and `any` is disallowed.

## 3. Missing prerequisites

These are absent today and block the first scaffold:

1. Git repository, `.gitignore`, and a decision on the remote host.
2. Node.js LTS pin (`.nvmrc`) and Corepack-enabled pnpm.
3. Local Docker with PostgreSQL 16 and Redis 7 available through Compose.
4. Environment variable names for database URL, Redis URL, API public origin, web public origin, and session secret. No secret values in git.
5. An authentication approach for organization members: session cookies issued by the API, or an external identity provider. This choice changes the first API module.
6. One runtime contract library. Zod is the recommended default because the same schema can serve the Nest boundary and the Next client. `class-validator` would stay inside Nest and would duplicate those shapes. Add the chosen library only when the first contract is written.
7. A local stand-in for S3 before product images or import-file retention are built. Local disk is enough until that feature; MinIO is optional and should not be added early.
8. Licensing and regulatory answers from requirements v2 section 13, especially ABDM Drug Registry / NRCeS use, public display of supplier contacts, and whether any workflow becomes a commercial transaction. No external drug data is loaded before that review.
9. A written tenant and role matrix: retailer member, distributor member, and platform admin, including which fields each role may read on another organization’s listing.

## 4. Architectural conflicts to resolve first

### Product scope

`AGENTS.md` makes procurement the MVP: verified suppliers, indicative prices, MOQ, stock status, freshness, enquiries, distributor self-service, and organization tenancy. Stock is never described as guaranteed.

Requirements v2 makes public medicine discovery the MVP. Stock, price comparison, and supplier enquiry are listed as future enhancements. Target users include the general public. Supplier contact visibility is explicitly undecided.

The one-page overview matches requirements v2.

Build the MedStock B2B workspace from `AGENTS.md`. Keep the v2 catalog concepts (drug, salt, manufacturer, supplier, mappings, import, audit, search visibility). Do not add a public unauthenticated supplier directory, and do not start enquiry, price, or stock work until the role matrix in prerequisite 9 is accepted. If public search is required, it is a later read-only catalog surface with supplier fields removed.

### Who owns supplier data

Requirements v2 has administrators maintain `Seller_Master` and drug–supplier mappings. `AGENTS.md` has distributor organizations own their listings, with admins verifying the organization and governing the canonical catalog.

The MVP data model uses organization-owned listings. An admin-edited seller row as the only source of stock or price would break tenant isolation and the distributor import workflow.

### Catalog shape

Requirements v2 stores a drug, then maps salts and companies. `AGENTS.md` search also includes strength, dosage form, pack size, manufacturer, and SKU.

Use a canonical medicine (brand, generic name, dosage form, manufacturer) plus composition lines (salt, strength, sequence) plus a pack/SKU (pack size and trade identifier). Supplier listings point at a SKU. They do not copy salt or manufacturer text onto the listing. A single `Drug_Master` row that embeds strength, pack, and seller will not support comparison across suppliers.

### Search

Requirements v2 describes a search-engine module, a `Drug_Search_Index` table, partial and case-insensitive match, salt combinations, alternate spellings, de-duplication, and ranking. `AGENTS.md` adds supplier filters and forbids a microservice split.

Implement search inside the Nest catalog module with PostgreSQL. Add supplier filters only for authorized retailer queries. Revisit a dedicated engine only after measured query performance requires it.

### Identity

Requirements v2 specifies administrator login, `Admin_User`, and `User_Roles`. `AGENTS.md` requires organization memberships and server-side RBAC for retailers and distributors as well.

There is one account system. Platform admin is a role, not a separate user table. Authorization is enforced in Nest on every tenant-scoped query.

### Technology baseline

Requirements v2 section 10 says the stack is not finalized. `AGENTS.md` finalizes it. Scaffolding uses the `AGENTS.md` stack. The “search engine” and “hosting” rows in the PDF are satisfied by PostgreSQL and ECS, not by new products.

### Patient data

`AGENTS.md` forbids patient clinical data. Requirements documents do not ask for it. No patient, prescription, or clinical module is in scope.

## 5. Implementation sequence

Each task stops before feature behavior. A task is finished only after its lint, typecheck, test, and build commands have actually been run.

### Task 0 — Decisions

Record short decisions in `docs/decisions.md` for: auth approach, Zod as the contract library, Node LTS version, and the role matrix. Confirm that MVP delivery follows `AGENTS.md`, with public supplier discovery deferred. No code.

### Task 1 — Workspace skeleton

Add the root workspace files, `.gitignore`, `.nvmrc`, `.editorconfig`, and empty `apps/*` and `packages/*` manifests with strict TypeScript. Add `infrastructure/docker/docker-compose.yml` for PostgreSQL and Redis, plus `.env.example` files. Do not add product routes, Prisma models, or UI screens.

### Task 2 — Database package

Initialize Prisma in `packages/database` with a PostgreSQL datasource and an empty schema. Generate the client and one initial migration only if the empty schema requires it. Export the client from the package entrypoint.

### Task 3 — API shell

Create the Nest application in `apps/api` with configuration, a health endpoint, validation pipe, and a dependency on `@medstock/database`. No domain modules.

### Task 4 — Web shell

Create the Next.js application in `apps/web` with the App Router, strict TypeScript, and a dependency on `@medstock/shared-types`. Add Tailwind and shadcn/ui with the shell, because `AGENTS.md` locks that UI stack. The first page can be a static placeholder. No search or auth UI.

### Task 5 — Shared contracts

Add `packages/shared-types` with the health response type only, consumed by the web app and the API. This proves the workspace boundary before catalog types exist.

### Task 6 — Quality gates

Wire root `lint`, `typecheck`, `test`, and `build`. API health is covered by Supertest. Playwright waits until a real flow exists.

### Later feature order, not part of this plan’s execution

After tasks 0–6: identity and organizations, canonical catalog, distributor listings and manual stock, CSV/XLSX import with BullMQ, retailer search and comparison, enquiries, admin verification and audit. Import jobs are the first reason to use Redis beyond local infrastructure.

## 6. Out of scope for the next task

- Medicine, supplier, enquiry, or admin features
- Microservices, Elasticsearch, or a second database
- Loading ABDM, NRCeS, or other external catalogs
- AWS account resources and production secrets
- Rewriting `AGENTS.md` or the two PDFs

## 7. Change made while writing this plan

`AGENTS.md ` was renamed to `AGENTS.md`. The trailing space prevented the instruction file from being opened by its expected path. File contents were not edited. The PDFs were not modified.

## 8. Distributor workspace

The signed-in distributor workspace is available only when the selected organization type is `DISTRIBUTOR`. The organization id is sent as the request target. Membership and permissions stay on the API.

| Route | Purpose |
| --- | --- |
| `/app` | Workspace home. Listing and import links appear for a distributor organization. |
| `/app/listings` | Own listings, search, status filters, and pagination. |
| `/app/listings/new` | Create a listing from a published catalog pack. |
| `/app/listings/:listingId` | Read commercial fields, edit them while the listing is active or paused, pause, resume, or archive. |
| `/app/imports` | Upload a CSV or XLSX preview and review import history. |
| `/app/imports/:importId` | Persisted preview, explicit commit, cancel, and completion counts. |
| `POST /api/distributor/imports` | Same-origin upload. Forwards the file with the server session and returns the import id. |

The web app needs `API_ORIGIN` and the Cognito session settings in `docs/authentication.md`. The API process verifies the access token and serves the existing listing, catalog, and import routes. No new secret is required for this workspace.

Known limits: archive cannot be undone here; catalog search shows published, search-visible medicines; upload shows a pending state rather than byte progress; a preview with invalid rows can still be committed, and those rows are skipped; Playwright is not set up for this flow.

## 9. Retailer discovery and enquiries

Retailer tools appear only when the selected organization is a `RETAILER`. Distributor enquiry tools appear only when it is a `DISTRIBUTOR`. The organization id is the request target. The API checks membership.

| Route | Purpose |
| --- | --- |
| `/app/discover` | Search the canonical catalog. Results are not recommendations or medical advice. |
| `/app/discover/medicines/:medicineId` | Read-only medicine, composition, and packs. |
| `/app/discover/listings` | Compare active distributor listings. Filters follow `GET /listings`. |
| `/app/discover/listings/:listingId` | Listing detail and the enquiry form. |
| `/app/enquiries` | Retailer history or distributor incoming list for the selected organization. |
| `/app/enquiries/:enquiryId` | Request, response, retailer close, or distributor reply. |

Prices on comparison screens are indicative. Freshness means the distributor updated a figure recently. An active listing is not proof of stock. A lower price is not a recommendation. Enquiry quantity is a positive number of catalog packs. Creating, answering, or closing an enquiry does not reserve stock, lock a price, or create an order or quote. Distributors cannot close an enquiry.

Catalog search summaries do not include composition or packs, so the search page loads each result through the existing medicine detail route. Enquiry responses include both organization ids so a changed workspace can drop a record from the previous organization. The response does not include the responding user's name.

Known limits: no orders, payments, notifications, chat, or attachments; no public supplier directory; no distributor name search beyond the listing filters the API already accepts.

## 10. Staging readiness

Deployment variables, Cognito settings, session and origin checks, health and readiness, migration rules, container build files, and the manual staging checklist are in `docs/deployment.md`. Automated tests do not include a live Cognito sign-in or an AWS deploy. Redis, BullMQ, and S3 remain unused by the running MVP.
