import assert from "node:assert/strict";
import test from "node:test";
import { healthResponseSchema } from "@medstock/shared-types";
import { apiRequest, authorizationHeaders } from "./api-client.ts";
import { authorizeUrl, safeReturnPath } from "./cognito.ts";
import { membershipForSelection, resolveOrganization, type OrganizationChoice } from "./organization.ts";
import { decideRequest } from "./route-guard.ts";
import { accessTokenExpired, cookiesClearedOnSignOut, openSession, sealSession } from "./session.ts";
import { loadWebAuthConfig, missingWebAuthSettings } from "./web-auth-config.ts";

const secret = "session-secret-session-secret-session";

function membership(id: string, status: OrganizationChoice["status"] = "ACTIVE"): OrganizationChoice {
  return {
    organizationId: id,
    status,
    role: "DISTRIBUTOR_OWNER",
    organization: {
      id,
      name: `Org ${id}`,
      type: "DISTRIBUTOR",
      status: "ACTIVE",
    },
  };
}

test("unauthenticated requests for the workspace redirect to sign-in", () => {
  const decision = decideRequest("/app", undefined);
  assert.equal(decision.kind, "redirect");
  if (decision.kind === "redirect") {
    assert.equal(decision.pathname, "/sign-in");
    assert.equal(decision.returnTo, "/app");
  }
  assert.equal(decideRequest("/", undefined).kind, "continue");
  assert.equal(decideRequest("/app/workspace", "sealed-cookie").kind, "continue");
});

test("a sealed session round-trips and an expired access token is detected without dropping the refresh token", () => {
  const sealed = sealSession(
    { accessToken: "access-token", refreshToken: "refresh-token", expiresAt: 50 },
    secret,
  );
  const opened = openSession(sealed, secret);
  assert.equal(opened?.refreshToken, "refresh-token");
  assert.equal(accessTokenExpired(opened!, 50), true);
  assert.equal(openSession(`${sealed}tampered`, secret), null);
  assert.equal(openSession(sealed, "another-secret-another-secret-1234"), null);
});

test("sign-out clears the session cookies and does not leave a token behind", () => {
  const names = cookiesClearedOnSignOut();
  assert.deepEqual(names, [
    "medstock_session",
    "medstock_pkce",
    "medstock_auth_retry",
    "medstock_organization",
  ]);
  assert.equal(names.some((name) => name.toLowerCase().includes("local")), false);
});

test("multiple organizations can be selected only from active memberships", () => {
  const first = "00000000-0000-4000-8000-000000000001";
  const second = "00000000-0000-4000-8000-000000000002";
  const suspended = "00000000-0000-4000-8000-000000000003";
  const memberships = [membership(first), membership(second), membership(suspended, "SUSPENDED")];
  assert.equal(resolveOrganization(memberships, undefined).kind, "choose");
  const selected = resolveOrganization(memberships, second);
  assert.equal(selected.kind, "selected");
  if (selected.kind === "selected") {
    assert.equal(selected.membership.organization.name, "Org 00000000-0000-4000-8000-000000000002");
  }
  assert.equal(membershipForSelection(memberships, suspended), null);
  assert.equal(membershipForSelection(memberships, "00000000-0000-4000-8000-000000000099"), null);
});

test("a user with no active memberships gets an empty organization state", () => {
  const result = resolveOrganization([membership("00000000-0000-4000-8000-000000000004", "INVITED")], undefined);
  assert.deepEqual(result, { kind: "empty", inactiveCount: 1 });
});

test("one active membership is the organization context without a stored selection", () => {
  const only = membership("00000000-0000-4000-8000-000000000005");
  const result = resolveOrganization([only], "00000000-0000-4000-8000-000000000099");
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") {
    assert.equal(result.membership.organizationId, only.organizationId);
  }
});

test("the API client attaches only the bearer token and surfaces API errors without raw bodies", async () => {
  const headers = authorizationHeaders("access-token");
  assert.equal(headers.get("authorization"), "Bearer access-token");
  assert.equal(headers.get("x-user-id"), null);
  assert.equal(headers.get("x-organization-id"), null);
  assert.equal(headers.get("x-role"), null);

  const denied = await apiRequest({
    apiOrigin: "http://api.local",
    path: "/identity/me",
    accessToken: "access-token",
    schema: healthResponseSchema,
    fetchImpl: async (_url, init) => {
      const requestHeaders = new Headers(init?.headers);
      assert.equal(requestHeaders.get("authorization"), "Bearer access-token");
      assert.equal(requestHeaders.get("x-role"), null);
      return new Response(JSON.stringify({ error: { code: "invalid_identity", message: "Sign in again." } }), {
        status: 401,
      });
    },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.status, 401);
    assert.equal(denied.message, "Your session expired. Sign in again.");
  }

  const failed = await apiRequest({
    apiOrigin: "http://api.local",
    path: "/identity/me",
    accessToken: "access-token",
    schema: healthResponseSchema,
    fetchImpl: async () =>
      new Response("Error: secret stack\n    at internal (/src/secret.ts:1:1)", { status: 500 }),
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.message, "The request could not be completed.");
    assert.equal(failed.message.includes("secret.ts"), false);
  }

  const domainError = await apiRequest({
    apiOrigin: "http://api.local",
    path: "/identity/me",
    accessToken: "access-token",
    schema: healthResponseSchema,
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { code: "import_forbidden", message: "You cannot access this import." } }), {
        status: 403,
      }),
  });
  assert.equal(domainError.ok, false);
  if (!domainError.ok) {
    assert.equal(domainError.code, "import_forbidden");
    assert.equal(domainError.message, "You cannot access this import.");
  }
});

test("Cognito configuration reports missing names and the authorize URL does not include a client secret", () => {
  assert.ok(missingWebAuthSettings({}).includes("SESSION_SECRET"));
  const config = loadWebAuthConfig({
    COGNITO_REGION: "ap-south-1",
    COGNITO_USER_POOL_ID: "ap-south-1_examplePool",
    COGNITO_CLIENT_ID: "abcdefghijklmnopqrstuvwxyz",
    COGNITO_DOMAIN: "medstock.auth.ap-south-1.amazoncognito.com",
    WEB_ORIGIN: "http://localhost:3000",
    API_ORIGIN: "http://localhost:3001",
    SESSION_SECRET: secret,
  });
  assert.ok(config);
  if (!config) {
    return;
  }
  const url = authorizeUrl(config, { state: "state", codeChallenge: "challenge" });
  assert.match(url, /code_challenge_method=S256/);
  assert.equal(url.includes("client_secret"), false);
  assert.equal(safeReturnPath("https://evil.example/phish"), "/app");
  assert.equal(safeReturnPath("/app"), "/app");
});
