# MedStock architecture decisions

Status: accepted for the MVP foundation. Authentication is specified here and is not implemented yet.

These decisions follow `AGENTS.md`. The one-page overview and requirements v2 PDF remain the catalog baseline. They do not override the product scope below.

## Product scope

MedStock is a B2B medicine procurement directory for medical stores and pharmacies in India.

The MVP follows `AGENTS.md`:

- Retailers search medicines, compare supplier listings, review indicative prices, minimum order quantities, stock status, and inventory freshness, and submit and track procurement enquiries.
- Distributors manage their organization’s listings, indicative prices, stock information, imports, and enquiry responses.
- Platform admins verify organizations, govern the canonical catalog, review import errors, and audit activity.

Public supplier discovery, a general-public website, location-based wholesaler search, mobile apps, external registry integration, and commercial checkout are deferred.

Catalog ideas kept from the requirements PDF: separate drug, salt, manufacturer, and supplier concepts; many-to-many composition and manufacturer mappings; dosage form and strength; alternate salt names; record status distinct from search visibility; bulk CSV/XLSX import with row-level errors and import history; audit timestamps; and partial, case-insensitive search. Supplier price and stock are organization-owned listings, not admin-edited rows in a seller master.

MedStock does not collect patient clinical data.

## Technology stack

| Concern | Decision |
| --- | --- |
| Frontend | Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS REST API |
| Architecture | One modular monolith. No microservices. |
| Database | PostgreSQL |
| ORM | Prisma, migrations only, generated client never hand-edited |
| Background jobs | Redis and BullMQ remain the choice for scheduled or unattended imports. The manual CSV/XLSX preview is synchronous because it is capped at 1 MB and 500 rows and does not need a worker. |
| Package manager | pnpm workspaces, scope `@medstock/*` |
| Shared contracts | Hand-written TypeScript types validated with Zod |
| Testing | Jest and Supertest for the API. Playwright for web end-to-end tests when the first user flow exists. |
| Local development | Docker Compose for PostgreSQL and Redis. The apps run on the host. |
| CI | GitHub Actions |
| Deployment | AWS (ECS/Fargate, RDS, S3, Secrets Manager, CloudWatch). Account setup and task definitions are deferred. |

Versions selected for this foundation:

- Node.js 26.13.0
- Next.js 16.4.5, React 19.3.1
- NestJS 12.3.3 on the default Express adapter
- Prisma ORM 7.10.1 (the current stable 7 release; Prisma 8 is still a release candidate)
- TypeScript 6.0.3
- Zod 4

Zod is the only runtime contract library. `class-validator` is not added, so request and response shapes are not maintained twice. Nest transport classes stay in `apps/api`. Prisma types stay in `packages/database`.

`@prisma/adapter-pg` and `pg` are required because Prisma 7 constructs `PrismaClient` with a driver adapter. BullMQ is not installed until the import worker exists.

## Node.js version

Pin: **26.13.0** in `.nvmrc`. The root `package.json` `engines.node` range is `>=26.13.0 <27`.

Node.js 26 “Lithium” became Active LTS on 28 October 2026 (release 26.13.0). Active support runs until 20 October 2027, and the line is supported until 30 April 2029. Node.js 24 and 22 are Maintenance LTS. Node.js 27 is an alpha line and is not used.

This pin is the current Active LTS that also satisfies the framework floors checked for this foundation:

- Next.js 16.4.5 requires Node.js `>=20.9.0`.
- NestJS 12 runs on Node.js 20.19+ (or 22.12+ on the 22 line). Current Nest CLI generators require 22.22.3+, 24.15+, or 26+.
- Prisma ORM 7.10.1 accepts `^20.19`, `^22.12`, or `>=24`.

## Authentication

Authentication is not implemented in this change. The boundary below is the contract for the first identity task.

### Provider

Use **Amazon Cognito** as the managed OIDC identity provider. It matches the AWS deployment target and can run in `ap-south-1` beside RDS. Cognito identifies the person. It does not decide which organization they belong to or what they can do.

A single `IdentityVerifier` port sits in the API:

- Input: bearer access token from the `Authorization` header.
- Output: an internal principal `{ userId, idpSubject, email }`.
- Business modules depend on that principal and on memberships loaded from PostgreSQL. They do not import the Cognito SDK.

Replacing Cognito means replacing the verifier and the web sign-in client. Organization, listing, and enquiry modules stay as they are.

### Responsibilities

| Layer | Responsibility |
| --- | --- |
| Cognito | Sign-up, sign-in, password reset, token issue, token signature. |
| API verifier | Validate issuer, audience, and expiry of the access token. Reject missing or invalid tokens on protected routes. |
| MedStock database | Map the IdP subject to one user. Store organization memberships and roles. |
| API authorization | On every tenant-scoped query, require a membership that grants the action on that organization. |
| Web app | Send the user to the IdP and attach the access token to API calls. It does not enforce permissions. |

There is one user account system. Platform admin is a membership role, not a separate user table.

### Local development

No Cognito user pool is created in this task. When authentication is built:

- Local tokens are validated against `OIDC_ISSUER` and `OIDC_AUDIENCE`.
- `AUTH_DEV_MODE=true` may select a localhost-only verifier that returns a fixed principal. The API must refuse that mode when `NODE_ENV=production`.
- Until the identity module exists, the API exposes only unauthenticated health.

### Environment variables

Names only. Values stay out of git. Production values belong in AWS Secrets Manager.

- `DATABASE_URL`
- `REDIS_URL`
- `WEB_ORIGIN`
- `API_ORIGIN`
- `PORT`
- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_AUDIENCE`
- `AUTH_DEV_MODE`
- `NODE_ENV`

## Role and permission matrix

A user acts only inside organizations where they have a membership. The API applies that filter on the server for every read and write. Hiding a control in the UI is not authorization.

Published listing fields (indicative price, currency, MOQ, stock status, freshness, and the distributor’s public branch context) are readable by retailer members so they can compare suppliers. Import files, other retailers’ enquiries, and another distributor’s unpublished data are not.

Platform admins govern the platform. They do not change a distributor’s price or stock as if they owned that inventory. They may suspend an organization or a listing.

| Action | Platform Admin | Retailer Owner/Admin | Retailer Staff | Distributor Owner/Admin | Distributor Staff |
| --- | --- | --- | --- | --- | --- |
| Organization profile and verification submission | Review and verify any organization | Edit own retailer organization | Read own organization | Edit own distributor organization and submit verification | Read own organization |
| Branches | Read for audit | Create and edit own organization branches | Read own organization branches | Create and edit own organization branches | Read own organization branches |
| Users and memberships | Grant or revoke platform-admin membership | Invite, remove, and change roles inside own organization | No membership changes | Invite, remove, and change roles inside own organization | No membership changes |
| Canonical medicine catalog | Create, edit, activate, and set search visibility | Read searchable catalog | Read searchable catalog | Read searchable catalog | Read searchable catalog |
| Supplier listings | Read for audit; suspend a listing | Read published listings | Read published listings | Create and edit own organization’s listings | Create and edit own organization’s listings |
| Price and stock | Read published and audited values; do not author them | Read indicative price, MOQ, stock status, and freshness | Read indicative price, MOQ, stock status, and freshness | Update own listings, including freshness | Update own listings, including freshness |
| Inventory imports | Review errors and import history | No access | No access | Upload and review imports for own organization | Upload and review imports for own organization |
| Procurement enquiries | Read for audit | Create and track enquiries for own organization | Create and track enquiries for own organization | Read and respond to enquiries sent to own organization | Read and respond to enquiries sent to own organization |
| Platform administration (catalog governance, organization verification, cross-tenant audit) | Yes | No | No | No | No |

### Tenancy records

Platform admin is a membership role. The membership needs an organization, so organization type includes `PLATFORM` in addition to `RETAILER` and `DISTRIBUTOR`. A platform admin membership belongs to a `PLATFORM` organization. Retailer and distributor organizations do not carry that role.

Allowed pairs:

| Organization type | Roles |
| --- | --- |
| `PLATFORM` | `PLATFORM_ADMIN` |
| `RETAILER` | `RETAILER_OWNER`, `RETAILER_STAFF` |
| `DISTRIBUTOR` | `DISTRIBUTOR_OWNER`, `DISTRIBUTOR_STAFF` |

A foreign key cannot express that pairing, because the role is on the membership and the type is on the organization. `@medstock/database` exports `assertMembershipRole`. The future membership API must call it in the same transaction as the insert. A direct Prisma write can still store a mismatched pair; PostgreSQL does not reject it.

Email is stored in normalized form: trimmed and lowercased by `normalizeEmail`. The unique index compares the stored value as written. The future user API must persist only that normalized value. The database does not rewrite email on insert.

Deleting a user or an organization is restricted while a membership still points at it. Removing a membership does not delete the user or the organization. Rows are not soft-deleted.

### Identity provisioning

An `IdentityAccount` row maps one external subject to one MedStock user. The provider for this task is `COGNITO`, and `providerSubject` is Cognito's `sub`. The pair is unique. The account does not store tokens or Cognito groups.

Provisioning looks up that pair first. A known subject returns its user and does not change the user's email or status. A new subject never attaches itself to an existing user because the email matches. That case returns `identity_link_required`. There is no self-service linking flow. A new subject with an unused verified email creates the user and the account in one transaction. New users stay `INVITED`.

An unverified email does not create or return a user.

Cognito access tokens are the only accepted tokens. The user pool must copy `email` and `email_verified` onto access tokens. Standard access tokens omit those claims, and MedStock rejects them. The API derives the issuer from the region and user pool. `OIDC_ISSUER` is accepted only when it equals that issuer. Signature checks use Cognito's JWKS through `aws-jwt-verify`. `AUTH_DEV_MODE` does not select a verifier. Outside production, missing Cognito settings mount the identity routes with a verifier that rejects every token. Production refuses to start without valid Cognito settings.

The web app uses the Cognito hosted UI with authorization code and PKCE. The Next.js server exchanges the code and stores the access and refresh tokens in an encrypted HttpOnly cookie. Browser code does not read those tokens, and they are not written to `localStorage`. The API still receives `Authorization: Bearer` from the server. Cognito groups are not roles. Organization choice is workspace context; membership is checked again on the API. Details are in `docs/authentication.md`.

## Medicine data and licensing

The first catalog is manually curated, or loaded from a file whose license and permitted use have been reviewed and recorded. External medicine datasets, including ABDM Drug Registry and NRCeS extracts, are not copied or queried until that review exists.

Model these as separate concepts, matching search in `AGENTS.md` and the normalized masters in the requirements PDF:

- Ingredient / salt, including alternate names
- Manufacturer
- Medicine: brand name, generic name, dosage form
- Composition line: ingredient, strength, and sequence on that medicine
- Pack / SKU: pack size and trade identifier for a medicine
- Supplier listing: one distributor organization, one SKU, indicative price, MOQ, stock status, quantity when the supplier provides it, freshness timestamp, and source (`manual` or an import batch)

Prices and stock always display when the supplier last updated them and whether the value came from a manual edit or an import. The product does not describe stock as guaranteed unless the supplier has confirmed that quantity for the enquiry.

Search stays inside the Nest catalog module and PostgreSQL. Inactive or search-hidden catalog records are excluded.

The catalog tables are medicine, ingredient, ingredient alias, manufacturer, composition, pack, and a medicine-to-company link with role `MANUFACTURER` or `MARKETER`. A medicine is not limited to one ingredient, one pack, or one company. Distributor organizations are not manufacturers. Strength stays on the composition row as a decimal plus a unit, and MedStock does not convert units. Pack quantity is not stock. GTINs are omitted until a licensed source exists.

Publication status and search visibility are separate. Ordinary search returns published, visible medicines only. Catalog writes require an active platform admin and are stored in `catalog_audit_events` with the actor id, action, entity, and time. The normalized display name is unique; dosage form remains free text until a pharmacist reviews a controlled vocabulary. Details are in `docs/catalog.md`.

A distributor listing belongs to one distributor organization and one medicine pack. Distributor owners and staff manage that organization's listings. Platform admins may suspend a listing and read it for audit, and they do not set its price or stock. Price and stock freshness are derived from server timestamps with a 7-day window. Listing audits are separate from catalog audits. Details are in `docs/listings.md`.

A procurement enquiry is a request for information about one listing. It is not an order or a quote, and it does not reserve stock or freeze the indicative price. Retailer members create, read, and close enquiries for their organization. Distributor members read and respond to enquiries addressed to them. They do not close those enquiries. Platform admins read enquiries through the admin route. Enquiry audits are separate from catalog and listing audits. Details are in `docs/enquiries.md`.

A distributor listing import is a manual CSV or XLSX preview that does not change listings until that distributor explicitly commits it. The importer matches canonical packs and never creates catalog records. BullMQ, S3, API, SFTP, ERP, and POS imports are deferred. Details are in `docs/imports.md`.
