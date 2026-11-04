# @medstock/api

NestJS REST API. The running application exposes `GET /health`, `GET /health/ready`, and the identity routes below. Production startup checks are described in `docs/deployment.md`.

## Identity service

`IdentityService.provision` resolves a `VerifiedIdentity` to a MedStock user:

- The email must be verified. An unverified email does not create a user and does not reveal whether that email exists.
- Lookup is by Cognito `sub` in `IdentityAccount`, not by email.
- A new subject with an unused email creates the user and the account in one transaction. The email is stored through `normalizeEmail`.
- A new subject whose email already belongs to a user is rejected with `identity_link_required`. It does not take over that user.
- A known subject returns its user and does not change that user's email or status.
- New users are `INVITED`. The caller cannot choose `UserStatus`.
- A concurrent create that hits the subject unique constraint returns the winning user.

## IdentityVerifier

```ts
verify(accessToken: string): Promise<VerifiedIdentity>
```

`VerifiedIdentity` contains `subject`, `email`, `emailVerified`, and an optional `displayName`. It does not contain the raw token.

`CognitoIdentityVerifier` checks Cognito access tokens with `aws-jwt-verify`:

- RS256 signature against the user pool JWKS, with that library's key cache
- Issuer derived from `COGNITO_REGION` and `COGNITO_USER_POOL_ID`
- `token_use` is `access`
- `client_id` matches `COGNITO_CLIENT_ID`
- `sub` is present
- `email` is present and `email_verified` is true

ID tokens are rejected. The issuer and JWKS URL are never taken from the request. Production startup fails when the Cognito settings are missing or invalid. In other environments, missing settings install `UnconfiguredIdentityVerifier`, which rejects every token. `AUTH_DEV_MODE` does not enable a verifier. `StaticIdentityVerifier` remains a test double and still refuses `NODE_ENV=production`.

The user pool must add `email` and `email_verified` to access tokens. A standard Cognito access token does not include them.

Routes, mounted from `IdentityHttpModule`:

- `GET /identity/me`
- `GET /organizations/:organizationId/memberships`
- `POST /organizations/:organizationId/memberships`

The bearer token is the only identity input. Organization roles stay in Postgres. Cognito groups are not authorization.

## Memberships

`MembershipService.createMembership` runs in one Prisma transaction. It checks that the user and organization exist, rejects a suspended organization or a disabled user, calls `assertMembershipRole`, and checks the actor:

- A retailer or distributor owner can invite people into that same organization, using a role allowed for its type.
- Staff cannot create memberships or raise a role.
- `PLATFORM_ADMIN` can be granted only by an active platform admin, and only on a `PLATFORM` organization.
- New memberships start as `INVITED`. Status changes go through `transitionStatus`, not a generic update.
- A duplicate user/organization pair becomes `duplicate_membership`, not a Prisma error.

Listing memberships is limited to active members of that organization. An active platform admin may read another organization's memberships, and that read is logged with the actor and organization ids.

Domain errors are mapped to `{ error: { code, message } }` by `DomainExceptionFilter`.

## Catalog

`CatalogService` maintains the shared medicine catalog. Ordinary clients can search and read published, visible medicines:

- `GET /catalog/medicines?q=&page=&pageSize=`
- `GET /catalog/medicines/:medicineId`

Platform admins manage drafts:

- `POST /admin/catalog/medicines` and `PATCH /admin/catalog/medicines/:medicineId`
- `PUT /admin/catalog/medicines/:medicineId/composition`
- `PUT /admin/catalog/medicines/:medicineId/packs`
- `PUT /admin/catalog/medicines/:medicineId/manufacturers`
- `POST /admin/catalog/medicines/:medicineId/publish`
- `POST /admin/catalog/medicines/:medicineId/archive`
- `POST /admin/catalog/ingredients` and `PATCH /admin/catalog/ingredients/:ingredientId`
- `POST /admin/catalog/manufacturers` and `PATCH /admin/catalog/manufacturers/:manufacturerId`

A write checks an active `PLATFORM_ADMIN` membership. The request body cannot grant that role. Entity definitions, search limits, and the import boundary are in `docs/catalog.md`.

## Listings

Distributor owners and staff manage listings for their own organization:

- `POST /distributor/listings?organizationId=`
- `GET /distributor/listings?organizationId=`
- `GET /distributor/listings/:listingId`
- `PATCH /distributor/listings/:listingId`
- `POST /distributor/listings/:listingId/pause`
- `POST /distributor/listings/:listingId/resume`
- `POST /distributor/listings/:listingId/archive`

Retailer members compare active listings with `GET /listings` and `GET /listings/:listingId`. A platform admin can read listings at `GET /admin/listings` and suspend one with `POST /admin/listings/:listingId/suspend`. Admins do not edit price or stock. Price and stock are indicative. Freshness is calculated by the server. See `docs/listings.md`.

## Enquiries

A retailer member can ask about an active listing. The distributor organization is taken from that listing. The requested quantity is a number of catalog packs. A distributor member can respond. The retailer can close the enquiry. The response is an enquiry, not an order or a quote, and it does not change the listing. See `docs/enquiries.md`.

## Listing imports

Distributor owners and staff upload a CSV or XLSX listing file for their own organization:

- `POST /distributor/imports?organizationId=`
- `GET /distributor/imports/:importId`
- `POST /distributor/imports/:importId/commit`
- `POST /distributor/imports/:importId/cancel`

The upload returns a preview and does not change listings. Commit applies only the valid staged rows. A platform admin can read one import at `GET /admin/imports/:importId` and cannot commit it. See `docs/imports.md`.

## Environment

Names only. Do not commit secret values.

- `DATABASE_URL`
- `PORT`
- `WEB_ORIGIN`
- `NODE_ENV`
- `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` — required in production
- `OIDC_ISSUER` — optional, and only valid when it matches the derived Cognito issuer
- `AUTH_DEV_MODE` — reserved. It does not enable a verifier.
