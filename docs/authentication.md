# Web authentication

MedStock identifies a person with Amazon Cognito and decides what they can do from organization memberships in PostgreSQL. The web app does not treat Cognito groups as roles, and it does not accept a user id or role from the browser.

## Session

The browser starts sign-in at `GET /api/auth/sign-in`. That route sends the user to the Cognito hosted UI with an authorization-code request and PKCE. The code verifier and state stay in a short-lived HttpOnly cookie.

`GET /api/auth/callback` checks the state, exchanges the code on the server, and stores the access token, refresh token, and expiry in `medstock_session`. That cookie is HttpOnly, `SameSite=Lax`, and `Secure` in production. It is encrypted with AES-256-GCM. The encryption key is derived from `SESSION_SECRET`.

The access token is not written to `localStorage`, `sessionStorage`, or a JavaScript-readable cookie. Server-side API calls add `Authorization: Bearer` from the cookie. The browser calls same-origin MedStock routes; it does not call the API with the token.

`GET /api/auth/refresh` uses the refresh token when the access token is expired or the API returns 401. A failed or repeated refresh clears the session and returns the user to `/sign-in?reason=expired`. The selected organization cookie is left in place so signing in again can restore that workspace. It still has to match an active membership.

`POST /api/auth/sign-out` clears the session, the PKCE cookie, the refresh-retry cookie, and the organization cookie, then sends the user to the Cognito logout URL. That post, and the import upload post, reject a cross-site `Origin`. `GET /api/auth/refresh` rejects a cross-site fetch and does not clear the session when it does. The callback remains a cross-site redirect from Cognito and is accepted only when `state` matches the PKCE cookie. MedStock does not send an OIDC nonce because it does not use ID tokens.

Tradeoff: the refresh token sits in the same encrypted cookie as the access token. An attacker who can read HttpOnly cookies, or who obtains `SESSION_SECRET` together with the cookie, can replay the session until it expires. The cookie is not available to page scripts, which removes the usual `localStorage` theft path. XSS that can call MedStock routes can still act as the signed-in user.

`AUTH_DEV_MODE` does not sign anyone in. `StaticIdentityVerifier` stays test-only on the API and is not used by the web app.

## Organization context

After sign-in the server loads `GET /identity/me`. The response includes each membership and the organization name, type, and status. The web app shows a membership role as a label. It does not send that role back to the API.

Active memberships are the only ones that can be selected. One active membership becomes the workspace automatically. Several active memberships require an explicit choice. The choice is stored in the HttpOnly cookie `medstock_organization`. Choosing an organization only changes that cookie after the current `/identity/me` response includes it as an active membership. Every later API call is still authorized by the API.

A signed-in user with no active membership sees that empty state. Suspended and invited memberships do not open a workspace.

`/app` is the authenticated shell. Users without a session cookie are redirected to `/sign-in`. Distributor and retailer screens are documented in `apps/web/README.md`. Staging configuration, health checks, and the manual validation flow are in `docs/deployment.md`.

## Cognito app client

Create a user pool app client in the same region as `COGNITO_REGION`. Use a public client and authorization-code grant with PKCE. Do not enable the implicit grant. Leave the client secret empty unless the client is confidential; a secret belongs only in `COGNITO_CLIENT_SECRET` on the server.

Allowed callback URL:

`http://localhost:3000/api/auth/callback`

Allowed sign-out URL:

`http://localhost:3000/sign-in`

Production uses the deployed `WEB_ORIGIN` with the same paths. The hosted UI domain, without `https://`, is `COGNITO_DOMAIN`.

Scopes used by the web app: `openid` and `email`.

The API accepts access tokens only. The pool must copy `email` and `email_verified` onto access tokens. A standard access token omits those claims and is rejected. ID tokens are not sent to the API.

## Environment

Next.js reads `apps/web/.env.local`. Names are also listed in the repository `.env.example`.

| Name | Purpose |
| --- | --- |
| `WEB_ORIGIN` | Browser origin, for example `http://localhost:3000` |
| `API_ORIGIN` | API origin, for example `http://localhost:3001` |
| `COGNITO_REGION` | User pool region |
| `COGNITO_USER_POOL_ID` | User pool id |
| `COGNITO_CLIENT_ID` | App client id |
| `COGNITO_DOMAIN` | Hosted UI hostname |
| `SESSION_SECRET` | At least 32 characters. Server only. |
| `COGNITO_CLIENT_SECRET` | Optional. Server only. Empty for a public client. |

Do not prefix these with `NEXT_PUBLIC_`.

The API process still needs `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, and `COGNITO_CLIENT_ID` so it can verify access tokens. No user pool is created by this repository.

## Local development without Cognito

Leave the Cognito and `SESSION_SECRET` values empty. `/sign-in` lists the missing variable names and does not redirect to Cognito. `/app` redirects to sign-in. The web test suite seals cookies and calls the API client with a fake `fetch`; it does not perform a live sign-in.

To inspect the existing retailer and distributor screens without Cognito, set `MEDSTOCK_LOCAL_PREVIEW=true` in `apps/web/.env.local` and restart Next.js. The default in `.env.example` is `false`. Preview mode is ignored unless that value is exactly `true`, and the web process refuses to start if it is `true` while `NODE_ENV=production`. It is not inferred from missing Cognito settings and it is not a `NEXT_PUBLIC_` variable.

While preview mode is on, `/app` renders a labeled mock user with one mock retailer organization and one mock distributor organization. A banner says the data is local, mock, and not authenticated. Organization switching is limited to those two ids. Reads come from the web app's mock module. Creates, updates, uploads, and enquiry actions are refused in the web app and are not sent to the API. Preview does not write a session cookie, a Cognito token, or database records. With the flag `false` or absent, sign-in and `/app` behave as they do today. The API's authentication and authorization are unchanged.

When `NODE_ENV=production`, the web process refuses to start unless the Cognito, origin, and session settings are valid and `AUTH_DEV_MODE` is not `true`. `next build` does not apply that check. Generate `SESSION_SECRET` with `openssl rand -base64 48`. Replacing it invalidates every sealed cookie. Details and the staging checklist are in `docs/deployment.md`.

When Cognito is configured, start the API and the web app, open `http://localhost:3000/sign-in`, and complete the hosted UI. This repository does not ship pool credentials, so a live sign-in is not part of the automated tests.
