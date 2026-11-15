# Interactive demo on free hosting

Free-tier hosting is for demonstration and evaluation. It is not for production customer workloads. This repository does not create Render or Neon resources, and nothing here turns on automatic deployment.

The interactive demo is a third mode. It is not local preview and it is not Cognito.

| Mode | Flag | Data | Who can enter |
| --- | --- | --- | --- |
| Local preview | `MEDSTOCK_LOCAL_PREVIEW=true` | Mock data in the web process | Nobody is authenticated. Refused when `NODE_ENV=production`. |
| Interactive demo | `MEDSTOCK_DEMO_MODE=true` | Isolated Neon database named `medstock_demo` | Three fixed identities chosen on the demo entry screen. |
| Cognito staging and production | `MEDSTOCK_DEMO_MODE` unset or `false` | That environment's own database | Cognito authorization-code flow with PKCE. |

`AUTH_DEV_MODE` does not sign anyone in. Demo mode cannot be combined with Cognito settings, `AUTH_DEV_MODE`, or local preview. The API and web processes refuse to start when those are mixed.

## Provider limits checked for this configuration

Checked against Render's free-plan documentation and Neon's free-plan documentation on 16 November 2026. Confirm the current pages before creating accounts, because providers change quotas.

Render free web service, from [Deploy for Free](https://render.com/docs/free):

- 512 MB RAM and less than 1 CPU.
- Spins down after 15 minutes without inbound HTTP traffic. The next request takes about one minute while Render shows a loading page.
- 750 free instance hours per workspace per calendar month, shared by every free service. Two services that stay awake all month need about 1,488 hours, so the workspace will suspend them before the month ends if health checks keep both awake.
- Outbound bandwidth is included per workspace. The public pricing page lists the included amount. Exceeding it bills a card on file, or suspends free services when no card is on file.
- Build pipeline minutes are included. Exceeding them can pause new builds.
- Free services can open public internet connections, including a Neon database. Render may suspend a free service that initiates an unusually high volume of outbound traffic. A small demo is within the normal case. This is not a private network.
- Do not use Render PostgreSQL. The free Render database expires.

Neon free plan, from [Neon plans](https://neon.com/docs/introduction/plans):

- $0. No separate paid plan is required for this demo.
- 100 projects, 100 CU-hours per project per month, 1 GB of Postgres storage per project, and 5 GB of public network transfer per project per month.
- Compute scales to zero after about 5 minutes of inactivity and wakes on the next connection. The first request after idle pays both the Render spin-up and the Neon wake.
- The pooler accepts many client connections. Direct connections on the smallest compute are much fewer. Use the pooled URL for the API and the direct URL for migrations.
- Storage or transfer limits suspend or reject growth until the next period or an upgrade. They do not require a subscription for the free allowance.

## Render services

Create two Render web services from this repository. Choose the free instance type. Leave auto-deploy off. `render.yaml` sets `autoDeploy: false` so a later blueprint apply does not start deploying until you change that value in the dashboard.

| Service | Dockerfile | Public URL |
| --- | --- | --- |
| `medstock-demo-api` | `apps/api/Dockerfile` | `https://medstock-demo-api.onrender.com` until a custom domain is added |
| `medstock-demo-web` | `apps/web/Dockerfile` | `https://medstock-demo-web.onrender.com` until a custom domain is added |

Docker context is the repository root. Both images use Node `26.13.0`, install dependencies with pnpm `9.15.4`, run as user `medstock` uid 1001, and listen on `PORT`. The web command uses `PORT` or `3000`. The API already reads `PORT`.

Health checks:

- API: `GET /health` returns `{"status":"ok","service":"medstock-api"}` without querying Postgres. `GET /health/ready` checks the database and returns 503 when Neon is waking or unavailable.
- Web: `GET /sign-in` renders the demo entry screen.

A Render health check is inbound traffic. On the free plan that can stop the service from sleeping and consume the 750 hour allowance. For a full month at $0, remove the health check path in the dashboard after the first successful deploy so the services can sleep. The first visit after 15 idle minutes then waits about a minute.

Set `NODE_OPTIONS=--max-old-space-size=384` on both services so Node collects garbage before the 512 MB limit. That can make requests slower. It does not remove features. The image sizes previously inspected were about 169 MB for the API and 279 MB for the web. Those are disk sizes, not resident memory. This pass did not run the containers under a 512 MB cap.

The web service's `API_ORIGIN` must be the public `https://` API URL. The browser never receives the access token. The Next.js server calls that public URL. Do not put an internal Render address in `API_ORIGIN` unless the browser and the server can both use it, which they cannot for this split. There is no private networking between these free services.

## Neon database

Create a new Neon project and a database named exactly `medstock_demo`. Do not reuse the local `medstock` database or its URL.

- Runtime `DATABASE_URL` on the API: the pooled host, which contains `-pooler`, with `sslmode=require`.
- Migrations, seed, and reset: the direct host, without `-pooler`, also with `sslmode=require`, passed only for that command.
- Keep both URLs in a password manager. Do not commit them, do not put them in `render.yaml`, and do not create a `NEXT_PUBLIC_` variable for them.
- Restrict the Neon role to the people who operate the demo. The Render API is the only application runtime that should hold the URL.
- Prisma uses the `pg` driver adapter. The pooler is PgBouncer. Migrations use session features, so they must use the direct URL. If the API reports prepared-statement errors through the pooler, set `DATABASE_POOL_MAX=1` and switch the runtime URL to the direct host. Start with the pooler and `DATABASE_POOL_MAX=3`.

The seed and reset commands connect and read `current_database()` before any write. They refuse a local host, port `5433`, a database not named `medstock_demo`, and any host that is not `*.neon.tech`. The API refuses to start in demo mode unless the same check passes. `prisma migrate reset` is not used.

## Environment variables

Generate two different secrets with `openssl rand -base64 48`. One is `SESSION_SECRET`. The other is `MEDSTOCK_DEMO_TOKEN_SECRET`. Do not reuse staging or production secrets.

API service:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MEDSTOCK_DEMO_MODE` | `true` |
| `AUTH_DEV_MODE` | `false` |
| `MEDSTOCK_LOCAL_PREVIEW` | `false` |
| `DATABASE_URL` | Neon pooled URL for database `medstock_demo` |
| `DATABASE_POOL_MAX` | `3` |
| `WEB_ORIGIN` | Public web origin, for example `https://medstock-demo-web.onrender.com` |
| `MEDSTOCK_DEMO_TOKEN_SECRET` | The demo HMAC secret |
| `PORT` | Render sets this. Do not hardcode it. |
| `RATE_LIMIT_TRUSTED_PROXY_HOPS` | `1` |
| `NODE_OPTIONS` | `--max-old-space-size=384` |

Leave every `COGNITO_*` variable and `OIDC_ISSUER` empty. Do not set `MEDSTOCK_DEMO_SEED` on Render.

The API does not read `CORS_ALLOWED_ORIGINS`. CORS allows only the exact `WEB_ORIGIN`. Cookies are not accepted on API requests. The browser does not send the demo token to the API. The web server attaches it.

Web service:

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MEDSTOCK_DEMO_MODE` | `true` |
| `AUTH_DEV_MODE` | `false` |
| `MEDSTOCK_LOCAL_PREVIEW` | `false` |
| `WEB_ORIGIN` | Same public web origin |
| `API_ORIGIN` | Public API origin, for example `https://medstock-demo-api.onrender.com` |
| `SESSION_SECRET` | The cookie secret |
| `MEDSTOCK_DEMO_TOKEN_SECRET` | The same demo HMAC secret as the API |
| `PORT` | Render sets this |
| `RATE_LIMIT_TRUSTED_PROXY_HOPS` | `1` |
| `NODE_OPTIONS` | `--max-old-space-size=384` |

Do not put `DATABASE_URL` on the web service. Do not add Cognito variables.

## Migrate, seed, and reset

From a machine that has the Neon URLs, with this repository checked out:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
pnpm install --frozen-lockfile
pnpm --filter @medstock/shared-types --filter @medstock/database build
export MEDSTOCK_DEMO_MODE=true
export DATABASE_URL="postgresql://USER:PASSWORD@DIRECT-HOST/medstock_demo?sslmode=require"
pnpm --filter @medstock/database demo:assert
pnpm --filter @medstock/database exec prisma migrate deploy
export MEDSTOCK_DEMO_SEED=confirm
pnpm --filter @medstock/database demo:seed
```

`demo:assert` must print `Demo database identity accepted` before `migrate deploy`. Use the direct Neon URL for both. Repeat `demo:seed` when you want idempotent updates without deleting visitor data. It upserts the fixed sample records.

To wipe visitor activity and load the sample set again, point `DATABASE_URL` at the direct `medstock_demo` URL and run:

```bash
export MEDSTOCK_DEMO_MODE=true
export MEDSTOCK_DEMO_SEED=confirm
pnpm --filter @medstock/database demo:reset
```

That command is not an HTTP route. Visitors cannot call it. A scheduled reset would need another free worker or a manual calendar reminder. Use the manual command. It refuses every database that is not the Neon `medstock_demo` database. It does not run `prisma migrate reset`.

Unset `MEDSTOCK_DEMO_SEED` when you are finished. Do not put that value on the Render services.

## Demo identities

The entry screen posts `retailer`, `distributor`, or `administrator`. The server maps that word to a fixed subject. A role or organization id in the request is ignored.

| Screen label | Email | Workspace |
| --- | --- | --- |
| Continue as retailer | `retailer.demo@example.test` | Northwind Chemist |
| Continue as distributor | `distributor.demo@example.test` | Sable Depot |
| Continue as platform administrator | `administrator.demo@example.test` | MedStock Demo Platform |

There is no registration. The session cookie `medstock_session` is HttpOnly, `SameSite=Lax`, and `Secure` on HTTPS. It expires in 8 hours. The token is an HMAC, not a Cognito JWT. Organization selection still has to match an active membership returned by the API.

Sample medicines, prices, stock, enquiries, and submissions are illustrative. Names, phone numbers, and organizations in the seed are fictional. The banner on the demo reads `DEMO ENVIRONMENT — SAMPLE DATA ONLY`.

## Deploy by hand

1. Create the Neon project and database. Run the migrate and seed commands above.
2. Create the two Render services from `render.yaml` or by selecting the Dockerfiles. Choose the free plan. Leave auto-deploy off.
3. Enter the environment variables in the dashboard. Save. Trigger one manual deploy for the API, then one for the web.
4. Open `https://medstock-demo-api.onrender.com/health` and `https://medstock-demo-web.onrender.com/sign-in`.
5. Enter as each identity and confirm search, a listing change, an enquiry, a submission, an approval, and the audit page. Those writes go to Neon through the existing API.

## Turn the demo off

Set `MEDSTOCK_DEMO_MODE=false` on both services and redeploy, or suspend the Render services. With the flag off, demo tokens are rejected and Cognito configuration is required again in production. Delete the Render services and the Neon project when the demo is finished. Deletion removes the sample data.
