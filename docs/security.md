# Security

MedStock keeps production credentials out of Git and checks authorization on the API. `.env.example` is safe to commit because it contains names and local placeholders. Real environment files are not.

## Environment variables

Copy `.env.example` to an untracked `.env` or `apps/web/.env.local`. Replace the local Compose defaults before any shared or production use.

| Name | Where it is read | Rule |
| --- | --- | --- |
| `DATABASE_URL` | API and Prisma | Required. Never log it. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Local Compose | Local placeholders only. |
| `REDIS_URL` | Reserved for a future worker | Not used by the current API. |
| `WEB_ORIGIN`, `API_ORIGIN` | Web and API | One origin. Production web origin must be `https`. |
| `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | API and web | Required together in production. |
| `OIDC_ISSUER` | API | Optional. Must match the issuer derived from the region and user pool. |
| `COGNITO_DOMAIN` | Web | Hosted UI hostname only. |
| `COGNITO_CLIENT_SECRET` | Web server | Optional. Only for a confidential client. Never `NEXT_PUBLIC_`. |
| `SESSION_SECRET` | Web server | At least 32 characters. Generate with `openssl rand -base64 48`. |
| `AUTH_DEV_MODE` | API and web | Must stay `false`. Production refuses to start when it is `true`. It does not sign anyone in. |
| `MEDSTOCK_LOCAL_PREVIEW` | Web server | Local mock UI only. Refused when `NODE_ENV=production`. Not a `NEXT_PUBLIC_` variable. |

Do not put secrets in `NEXT_PUBLIC_*` variables, source files, Docker images, or API responses.

## AWS Secrets Manager

The application does not call AWS at runtime. ECS injects secret values into environment variables when a task starts. This repository does not create the secrets, roles, or services.

Create two JSON secrets per environment:

| Secret name | Container | Keys |
| --- | --- | --- |
| `medstock/staging/api` | API | `DATABASE_URL`, `WEB_ORIGIN`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, optional `OIDC_ISSUER` |
| `medstock/staging/web` | Web | `SESSION_SECRET`, `WEB_ORIGIN`, `API_ORIGIN`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_DOMAIN`, optional `COGNITO_CLIENT_SECRET` |

Map each JSON key to the same environment variable name in the ECS task definition `secrets` block. Also set plain, non-secret environment values there: `NODE_ENV=production`, `AUTH_DEV_MODE=false`, `PORT=3001` on the API, and `MEDSTOCK_LOCAL_PREVIEW=false` on the web task. Set `RATE_LIMIT_TRUSTED_PROXY_HOPS=1` only when one load balancer appends the client address.

IAM:

- The task execution role (`ecs-tasks.amazonaws.com`) pulls the image and reads the two secret ARNs. Allow `secretsmanager:GetSecretValue` on those ARNs only, plus `kms:Decrypt` if a customer-managed key encrypts them.
- The task role is the identity of the running process. MedStock does not read Secrets Manager itself, so this role does not need secret permissions.
- Do not put secret values in Docker build arguments, image layers, Git, or the task definition `environment` block.

Local development does not call Secrets Manager. Copy `.env.example` to an untracked env file instead.

## Git ignore

The root ignore rules cover `.env`, `.env.*` except `.env.example` and `.env.template`, private keys (`*.pem`, `*.key`, `*.p12`, `*.pfx`), and `secrets/`, `private/`, `credentials/`, and `.aws/`. `.dockerignore` excludes the same secret files from image builds. The Dockerfiles copy the repository, so a secret that is not ignored could otherwise enter an image.

Adding a file to `.gitignore` does not remove it from history. If a real secret was committed, treat it as compromised, rotate it, and remove it from the index only with a reviewed history-cleaning process. Do not rewrite history as part of routine development.

## Rotation

ECS reads Secrets Manager only when a task starts. After a secret changes, start a new deployment so tasks receive the new value. Do not expect a running container to reload it.

- `SESSION_SECRET`: deploy the new value and restart the web process. Existing sealed cookies stop opening. Users sign in again.
- `COGNITO_CLIENT_SECRET`: create the replacement in Cognito, deploy it, and restart the web process. A public PKCE client should not have a secret.
- `DATABASE_URL`: point new tasks at the new credential, restart the API, then disable the old credential. Do not log the URL.
- Cognito user-pool or app-client replacement: deploy the new ids together, then retire the old client.

## Cognito and sessions

The API verifies Cognito access tokens with `aws-jwt-verify` against the configured user pool and app client. `createCognitoAccessTokenChecker` in `apps/api/src/identity/cognito-identity.verifier.ts` checks the signature against the pool JWKS, then the issuer, expiry, `token_use=access`, and client id. `CognitoIdentityVerifier.verify` then requires a non-empty `sub`, an email address, and `email_verified`. A failed signature, issuer, client, token use, or expiry becomes `invalid_identity`. A missing or unverified email does not sign the user in.

`IdentityService.provision` maps `sub` to `identity_accounts`. It does not copy Cognito groups into roles. A new subject with an unused email becomes an `INVITED` user and receives no membership. A subject whose email already belongs to another local user is not linked. A mapped user with status `DISABLED` is rejected with `disabled_identity` and cannot call protected routes. Membership roles, including `PLATFORM_ADMIN`, are written only by `MembershipService` after an active manager or platform admin is checked. Inactive memberships fail the listing, import, enquiry, and catalog authorization checks.

The web sign-in route is `GET /api/auth/sign-in` (`createPkcePair`, `createAuthState`). The callback is `GET /api/auth/callback`. It accepts the code only when `state` matches the sealed PKCE cookie, then exchanges the code with the verifier. The redirect URI is built from `WEB_ORIGIN`, not from the request. There is no OIDC nonce because ID tokens are not used. `safeReturnPath` rejects scheme URLs, protocol-relative paths, and `/sign-in` or `/api/` destinations.

`GET /api/auth/refresh` exchanges the refresh token only when `decideRefresh` returns `refresh`. A second request inside the 60-second retry window keeps the current session when its access token is still unexpired, and does not call Cognito again. The same window still signs the user out when the access token is expired, which stops a refresh loop. Concurrent refreshes of the same refresh token share one Cognito call inside that web process. A network failure redirects to `/sign-in?reason=unavailable` and leaves the session cookie in place. Cognito rejecting the refresh token, including an expired refresh token or a rotated token that was reused, clears the session and retry cookies. The organization cookie stays until sign-out. This single-flight map is process-local. Two web tasks can still race if the user pool rotates refresh tokens.

The session cookie max age is 30 days. Access-token expiry is the `expiresAt` value stored from Cognito `expires_in`. Cognito does not return a refresh-token expiry in the token response used here, so refresh-token expiry is enforced only when the token endpoint rejects the token. The ciphertext uses AES-256-GCM. A changed byte fails authentication and the cookie is treated as signed out. The cookie is HttpOnly. Application code does not write tokens to `localStorage`, `sessionStorage`, or a script-readable cookie.

`POST /api/auth/sign-out` deletes the session, PKCE, retry, and organization cookies before redirecting to the Cognito logout URL.

Every protected API route loads the caller through `IdentityService.provision`. Disabling the local user rejects the next request that presents an already issued access token. An invited, suspended, or removed membership does not authorize listing, import, enquiry, or catalog administration. `/identity/me` can still return the disabled response code instead of the profile.

Automated tests sign tokens with a local RSA key and a cached JWKS. They do not call AWS. A live user pool has not been tested.

## Interactive demo

`MEDSTOCK_DEMO_MODE=true` is a separate sign-in path for a public sample deployment. It is not `AUTH_DEV_MODE` and it is not local preview. The web and API refuse to start when demo mode is combined with Cognito settings, `AUTH_DEV_MODE`, or `MEDSTOCK_LOCAL_PREVIEW`.

The browser posts one of three labels: retailer, distributor, or platform administrator. The server maps that label to a fixed subject, email, and name. It ignores any role or organization id in the request. The session cookie is the same AES-256-GCM `medstock_session` cookie: HttpOnly, `SameSite=Lax`, and `Secure` on HTTPS. Demo cookies expire in 8 hours. The bearer token inside the cookie is an HMAC signed with `MEDSTOCK_DEMO_TOKEN_SECRET`. It is not a Cognito token. When demo mode is off, that token is rejected by the Cognito or unconfigured verifier.

The API accepts the HMAC only while demo mode is on, and only for those three identities. Production demo startup also requires the connected database to be named `medstock_demo` on a `*.neon.tech` host. A localhost URL, port `5433`, and the local `medstock` database are refused. Seed and reset use the same check and an extra `MEDSTOCK_DEMO_SEED=confirm` flag. They are command-line operations. There is no public reset route.

Demo identities are stored in the existing `identity_accounts` table because that table has a single provider value. They are not Cognito users. Cognito staging and production keep validating JWTs exactly as above when demo mode is off.

Organization authorization is unchanged. A membership cookie is accepted only when `/identity/me` still lists that organization. Listing, enquiry, submission, and audit routes check the membership again. Platform audit events are visible only to an active platform administrator.

The demo is sample data on free hosting. Limits, cold starts, and the manual reset are in `docs/demo-deployment.md`. Free-tier hosting is for demonstration, not production customer workloads. The demo has not been deployed.

The web app uses the hosted UI with authorization code and PKCE. Access and refresh tokens live in the `medstock_session` cookie. The cookie is HttpOnly, `SameSite=Lax`, and `Secure` in production. Its payload is AES-256-GCM. The key is the SHA-256 hash of `SESSION_SECRET`. Sign-out clears the session, PKCE, refresh-retry, and organization cookies.

`returnTo` accepts only a same-site path. Scheme URLs, protocol-relative URLs, and paths under `/sign-in` or `/api/` become `/app`.

Cookie-changing routes check `Origin`. The organization cookie is accepted only when the current membership list includes that organization. The API authorizes the membership again.

## API, database, and uploads

Protected routes use the identity guard. Catalog publication and submission approval require an active platform admin. Distributor and retailer queries are scoped to an organization membership. Pending medicine submissions are not catalog rows and are not returned by medicine search.

Prisma queries are parameterized. Search similarity uses `Prisma.sql` placeholders. Listing imports accept only CSV or XLSX, stop at 1 MiB and 500 rows, and neutralize spreadsheet formulas. The stored file name is not used as a filesystem path.

API responses send `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and `Cache-Control: no-store`. The web app sends the same framing and content-type headers, plus a content security policy limited to `frame-ancestors`, `base-uri`, and `object-src`. `Strict-Transport-Security` is added only when `NODE_ENV=production`. A full `script-src` policy is not set, because Next.js serves its own scripts and a strict policy would need a tested nonce setup.

Logs record method, path, status, duration, and request id. They do not record tokens, cookies, connection strings, or upload bytes. Unexpected failures return `{ error: { code: "internal_error", message: "The request could not be completed." } }` without a stack trace.

The API and web app keep a fixed-window counter in process memory. A limit returns HTTP 429 with `retry-after` and `{ error: { code: "rate_limited", message: "Too many requests. Try again shortly." } }`. The log records the method, path, and limit class. It does not record the address, token, or forwarding header.

`X-Forwarded-For` is ignored unless `RATE_LIMIT_TRUSTED_PROXY_HOPS` is 1, 2, or 3. The trusted value is counted from the right, which is the address appended by the nearest proxy. A client-supplied left-hand value is not used. Local development leaves the hop count at 0 and uses the socket address, or one shared web-task key when the request has no socket. Defaults are higher outside production. `NODE_ENV=test` disables the limiter so the suite can share one address. Production ignores `RATE_LIMIT_DISABLED`.

Covered paths use separate counters. Sign-in, the Cognito callback, refresh, and sign-out use the auth limit. Import file upload uses the upload limit. Catalog search uses the search limit. Enquiry creation uses the enquiry limit. Medicine submission writes use the submission limit. Listing writes use the listing limit. Other state-changing API calls, including import commit and cancellation, use the mutation limit. Health checks use the health limit. Ordinary reads use the default limit. Listing and submission reads stay on that default so a pharmacy user can browse without sharing a write budget.

Each class has its own environment override: `RATE_LIMIT_AUTH`, `RATE_LIMIT_UPLOAD`, `RATE_LIMIT_SEARCH`, `RATE_LIMIT_ENQUIRY`, `RATE_LIMIT_LISTING`, `RATE_LIMIT_SUBMISSION`, `RATE_LIMIT_MUTATION`, `RATE_LIMIT_HEALTH`, and `RATE_LIMIT_DEFAULT`. `RATE_LIMIT_WINDOW_MS` sets the window, with a 60-second default. Production defaults per window are 30 auth, 10 uploads, 60 searches, 20 enquiries, 60 listing writes, 20 submission writes, 60 other mutations, 120 health checks, and 300 other requests. Development defaults are higher so local use is not blocked. An invalid override falls back to the default.

Behind one AWS load balancer, set `RATE_LIMIT_TRUSTED_PROXY_HOPS=1` on the web and API tasks. The load balancer appends the client address, and the limiter reads that rightmost trusted value. Leave the hop count at 0 when there is no trusted proxy. Counters are not shared between the web and API processes, or between ECS tasks, and they reset on restart. This is not distributed rate limiting and does not replace a load-balancer limit.

## Dependency audit

From the repository root, with Node 26.13.0:

```bash
pnpm audit
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @medstock/database exec prisma validate
pnpm --filter @medstock/database exec prisma migrate status
```

Do not use `pnpm audit fix --force`. Review a vulnerability, apply the smallest compatible update, and rerun the checks above.

`pnpm audit` reports 5 moderate and 1 low findings, and no high or critical findings. No compatible upgrade was applied. None of these code paths are reachable from an API request.

| Package | Installed | Path | Direct | Runtime | Patched | Reachable in MedStock | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `uuid` | 8.3.2 | `apps/api > exceljs@4.4.0 > uuid` | Transitive | Yes, through XLSX import | `>=11.1.1` | No. The advisory is a bounds check in uuid v3, v5, and v6 when `buf` is passed. ExcelJS calls `v4()` with no buffer. | uuid 11 is ESM-only. ExcelJS 4.4.0 depends on `uuid@^8.3.0` and loads it with `require()`. No newer ExcelJS release changes that. |
| `glob` | 10.5.0 and 13.0.6 | Jest reporters, config, and runtime | Transitive dev | Development and test only | `>=14.0.2` | No. Jest chooses the patterns. The advisory is an AbortSignal cancellation bypass during filesystem traversal. | `jest-config@30.5.2` depends on `glob@^13.0.6`. Glob 14 is outside that range, so it was not overridden. |
| `minimatch` | 9.0.9 and 10.2.6 | `@nestjs/cli@12.0.11` and Jest | Transitive dev | Development and test only | `>=11.0.1` | No. The advisory is glob-pattern amplification in the CLI tools, not request handling. | Nest CLI pins `minimatch@10.2.6`. Minimatch 11 is outside that pin. |
| `deepmerge` | 4.3.1 | `jest-config@30.5.2` | Transitive dev | Development and test only | none (`<0.0.0`) | No. Jest merges its own config. Request bodies are not passed to `mergeObject()`. | No patched release exists. Keep it out of the production image with the development dependency set. |

## Images

`apps/api/Dockerfile` and `apps/web/Dockerfile` build from the lockfile, then copy a production deploy (`pnpm deploy --prod`) into a second stage. The runtime images do not include the npm cache, Git metadata, Jest, or the Nest CLI. The API runtime image includes OpenSSL for Prisma. Both images run as user `medstock` (uid 1001), own only their runtime directory, and have no secret build arguments. `.dockerignore` excludes `.git`, env files, private keys, local database files, and local `node_modules`, `dist`, and `.next` output. Production configuration is supplied by the task environment, not by the image. The images expose ports 3001 and 3000. The web process listens on `PORT` when that variable is set. The free demo sets a Node heap cap in the Render environment, not in the image, so Cognito staging is not limited by the 512 MB free-instance setting.

## Staging checklist

- Secrets come from Secrets Manager, not from Git or the image.
- `NODE_ENV=production`, `AUTH_DEV_MODE` is not `true`, `MEDSTOCK_LOCAL_PREVIEW` is not `true`, and `MEDSTOCK_DEMO_MODE` is not `true`. The free demo in `docs/demo-deployment.md` is a different deployment.
- `WEB_ORIGIN` is one `https` origin and matches the Cognito callback and logout URLs.
- `SESSION_SECRET` was generated with `openssl rand -base64 48` and is at least 32 characters.
- The database user is not a superuser and the instance is not open to the internet.
- Migrations were applied with `prisma migrate deploy`. The database was not reset.
- A live Cognito user pool has been tested for sign-in, expiry, refresh, and sign-out.
- Rate limiting and access logs exist at the load balancer.
- `pnpm audit` has no unresolved critical or high advisory that affects the running versions.
