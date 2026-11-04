# Staging deployment

This is the configuration and validation reference for a staging environment. Passing the automated checks does not make MedStock production-ready. A real Cognito user pool, a staging database, and the manual flow below are still required. This repository does not create AWS resources.

Redis, BullMQ, and S3 are not required. Manual imports run in the API process. `infrastructure/docker/docker-compose.yml` still starts Redis for later unattended imports. Staging can omit it.

## Runtime variables

Names and placeholders live in `.env.example`. Do not commit values.

| Name | Process | Required in production | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | API, Prisma | Yes | PostgreSQL URL. The API refuses to start without it. |
| `PORT` | API | No | Defaults to `3001`. |
| `WEB_ORIGIN` | API and web | Yes | One origin, no path and no wildcard. Production must be `https`. The API allows CORS only for this exact origin and does not accept cookies on API requests. |
| `API_ORIGIN` | Web | Yes | Origin the Next.js server calls. The browser does not call it with the access token. |
| `COGNITO_REGION` | API and web | Yes | For example `ap-south-1`. |
| `COGNITO_USER_POOL_ID` | API and web | Yes | Must start with the region and an underscore. |
| `COGNITO_CLIENT_ID` | API and web | Yes | Public app client id unless a secret is also set. |
| `COGNITO_DOMAIN` | Web | Yes | Hosted UI hostname only, without `https://`. |
| `OIDC_ISSUER` | API | No | When set, it must equal `https://cognito-idp.$COGNITO_REGION.amazonaws.com/$COGNITO_USER_POOL_ID`. |
| `SESSION_SECRET` | Web | Yes | At least 32 characters. Server only. |
| `COGNITO_CLIENT_SECRET` | Web | No | Server only. Leave empty for a public PKCE client. |
| `NODE_ENV` | Both | Yes | `production` in staging and production. |
| `AUTH_DEV_MODE` | Both | Must be false | It does not select a verifier. Production startup fails when it is `true`. |

The web process reads `apps/web/.env.local` in development and the process environment in staging. Do not use `NEXT_PUBLIC_` for any of these.

Production startup fails closed:

- The API requires `DATABASE_URL`, an `https` `WEB_ORIGIN`, and a complete Cognito verifier configuration. A partial Cognito configuration is an error in every environment.
- Outside production, missing Cognito settings install a verifier that rejects every token.
- The web server, when `NODE_ENV=production` and it is not building, requires the web auth settings and an `https` `WEB_ORIGIN`. `next build` does not apply that check.
- `StaticIdentityVerifier` refuses to run when `NODE_ENV=production`.

## Cognito

Create the user pool and app client manually. Use the authorization-code grant and PKCE. Do not enable the implicit grant.

| Setting | Value |
| --- | --- |
| Callback URL | `$WEB_ORIGIN/api/auth/callback` |
| Sign-out URL | `$WEB_ORIGIN/sign-in` |
| Scopes | `openid`, `email` |
| Access token | Copy `email` and `email_verified` onto the access token |
| Domain | The hostname stored in `COGNITO_DOMAIN` |

The web app sends `state` and a PKCE S256 challenge. It does not send an OIDC nonce because it does not accept ID tokens. The callback rejects a missing or mismatched `state` before it exchanges the code. The token request sends the code verifier and the callback URL derived from `WEB_ORIGIN`.

Refresh uses the refresh token. When Cognito returns a new refresh token, the cookie stores that value. A failed refresh, or a second refresh within 60 seconds, clears the session and returns to `/sign-in?reason=expired`. The organization cookie is kept and is accepted again only when `/identity/me` lists that organization as an active membership. Enable refresh-token rotation in the user pool if the pool should invalidate the previous refresh token. That pool setting was not exercised from this repository.

## Session cookie

`medstock_session` is HttpOnly, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`. The payload is AES-256-GCM. The key is SHA-256 of `SESSION_SECRET`. Sign-out clears `medstock_session`, `medstock_pkce`, `medstock_auth_retry`, and `medstock_organization`.

`returnTo` must be a same-site path. Values with a scheme, a protocol-relative `//`, or a path under `/api/` or `/sign-in` become `/app`.

Cookie-authenticated changes check the caller. `POST /api/auth/sign-out` and `POST /api/distributor/imports` require an `Origin` equal to the web app's own origin and reject `Sec-Fetch-Site: cross-site`. `GET /api/auth/refresh` rejects a cross-site fetch so another site cannot navigate the browser into a refresh. The Cognito callback stays a cross-site redirect and is bound by `state` and PKCE instead. Next.js server actions keep their built-in origin check. `SameSite=Lax` remains in place. None of this was verified against a live hosted UI.

## Secrets

Generate a session secret with `openssl rand -base64 48`. Store production values in AWS Secrets Manager or the host's secret store. Do not put them in the image.

Rotation:

- `SESSION_SECRET`: deploy the new value and restart the web process. Existing cookies no longer open, so users sign in again. There is no key identifier and no overlap window.
- `COGNITO_CLIENT_SECRET`: create the new client secret in Cognito, deploy it, and restart the web process. A public PKCE client should not have one.
- `DATABASE_URL`: point the new tasks at the new credential, restart the API, then retire the old database credential. Do not log the URL.

Logs include the method, path, status, duration, and request id. They do not include the Authorization header, cookies, tokens, session payloads, or uploaded file bytes. A 500 response is `{ error: { code: "internal_error", message: "The request could not be completed." } }`. Domain errors keep their own code and message. The admin import read log contains the actor id, import id, and organization id only.

## Health

`GET /health` answers `{ status: "ok", service: "medstock-api" }` without touching the database. Use it as a liveness check.

`GET /health/ready` runs `SELECT 1`. A successful check is `{ status: "ready", service: "medstock-api" }`. A database failure is HTTP 503 with `{ status: "unavailable", service: "medstock-api" }` and no connection string. The API enables Nest shutdown hooks and disconnects Prisma on shutdown.

Each response includes `x-request-id`. A caller may send an id of up to 64 letters, numbers, underscores, or hyphens. Anything else is replaced.

## Database

Apply migrations with `prisma migrate deploy` from `packages/database`. Do not use `migrate reset` or `migrate dev` against staging. The local MedStock database, when it is already migrated, should only be checked with `prisma migrate status`.

Take a snapshot before the first staging deploy. Prisma migrations in this repository are forward-only. A failed or unwanted migration is rolled back by restoring that snapshot, not by a down migration. That restore path was not executed here.

Foreign keys use `ON DELETE RESTRICT` for users, organizations, listings, imports, and enquiries. Membership, listing, enquiry, and import indexes follow the organization id used by tenant queries. Listing, import, and enquiry writes that change status commit the row and its audit event in one transaction. Import commit claims the preview with a conditional update before it writes listings.

## Containers and CI

`apps/api/Dockerfile` and `apps/web/Dockerfile` build from the repository root with Node 26.13.0. They are not started by the local Compose file. Build them only when a staging host is ready:

```text
docker build -f apps/api/Dockerfile -t medstock-api .
docker build -f apps/web/Dockerfile -t medstock-web .
```

GitHub Actions runs Prisma validate, lint, typecheck, test, and build against PostgreSQL 16. It does not deploy.

## Tenant isolation

Identity comes from the verified access token. Membership and role come from PostgreSQL. An organization id in a query is the target of that membership check. Listing, import, and enquiry ids load the row and then check the caller's membership in that row's organization. A miss is a not-found or forbidden response, not the other tenant's data. Retailer discovery returns active public listing fields and does not return source notes or audit rows. Platform-admin import and enquiry reads are separate routes and write an audit event. Lifecycle transitions for pause, resume, archive, import commit, import cancel, enquiry response, and enquiry close are conditional updates in the API. The web app's hidden buttons are not the control.

Existing API tests cover a retailer rejected from an import, a second organization hidden from an import id, a retailer rejected from catalog writes, and a non-member rejected from membership changes. This pass did not find a route that trusts a client role or user id. It also did not add a new cross-tenant fixture beyond those tests.

## Staging validation

Do these steps only after the pool, app client, hosted UI domain, callback URL, sign-out URL, and access-token email claims exist. Steps 1, 4, 8, and 12 require that live Cognito setup. The automated suite does not perform them.

1. Sign in as a platform admin and confirm `GET /identity/me` shows an active `PLATFORM_ADMIN` membership.
2. Create or activate one retailer organization and one distributor organization. Suspended organizations must not gain listing or enquiry access.
3. Add an active retailer membership and an active distributor membership. Confirm an invited or suspended membership cannot be selected.
4. Sign in as the distributor. Confirm the workspace shows listings, imports, and incoming enquiries, and does not show retailer discovery.
5. Create one listing for a published catalog pack. Confirm the price is labeled indicative.
6. Upload a CSV or XLSX file and stop on the preview. Confirm listings did not change yet.
7. Commit that preview. Confirm created and updated counts, then cancel is no longer offered.
8. Sign in as the retailer. Confirm discovery is available and distributor listing management is not.
9. Search for the medicine. Confirm the result is a catalog record, not a recommendation.
10. Compare listings. Confirm indicative price, freshness wording, and that a lower price is not marked as recommended.
11. Submit an enquiry for a positive number of catalog packs. Confirm the detail page says it is not an order, quote, or reservation.
12. Sign in as the distributor.
13. Respond while the enquiry is open. Confirm the listing price and stock did not change, and that a second response is rejected.
14. Sign in as the retailer.
15. View the response and close the enquiry. Confirm the response is not presented as an order or quote, and that the closed enquiry cannot be closed again.
16. With a second retailer and a second distributor, confirm each enquiry, import, and private listing id from the first pair is not readable by the other pair.

After deploy, call `GET /health` and `GET /health/ready` from the load balancer. Ready must be 200 before traffic is sent.

## What remains unverified

Live Cognito sign-in, token refresh against Cognito, hosted UI logout, refresh-token rotation in a real pool, TLS termination, the container images on a staging host, and restoring a database snapshot have not been run. Do not treat a green local test run as that evidence.
