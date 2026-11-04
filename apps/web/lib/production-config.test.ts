import assert from "node:assert/strict";
import test from "node:test";
import { sameOriginMutation } from "./request-origin.ts";
import { assertProductionWebConfig } from "./production-config.ts";
import { safeReturnPath } from "./cognito.ts";

const productionEnv = {
  NODE_ENV: "production",
  COGNITO_REGION: "ap-south-1",
  COGNITO_USER_POOL_ID: "ap-south-1_examplepool",
  COGNITO_CLIENT_ID: "abcdefghijklmnopqrst",
  COGNITO_DOMAIN: "medstock.auth.ap-south-1.amazoncognito.com",
  WEB_ORIGIN: "https://staging.example.com",
  API_ORIGIN: "https://api.staging.example.com",
  SESSION_SECRET: "staging-session-secret-with-32-characters",
};

test("production web startup fails closed without a session secret or with AUTH_DEV_MODE", () => {
  assert.throws(() => assertProductionWebConfig({ ...productionEnv, SESSION_SECRET: "short" }));
  assert.throws(() => assertProductionWebConfig({ ...productionEnv, AUTH_DEV_MODE: "true" }));
  assert.throws(() => assertProductionWebConfig({ ...productionEnv, MEDSTOCK_LOCAL_PREVIEW: "true" }));
  assert.throws(() => assertProductionWebConfig({ ...productionEnv, WEB_ORIGIN: "http://staging.example.com" }));
  assert.doesNotThrow(() => assertProductionWebConfig(productionEnv));
  assert.doesNotThrow(() => assertProductionWebConfig({ NODE_ENV: "development" }));
});

test("cookie mutations accept only the application origin", () => {
  assert.equal(
    sameOriginMutation({
      method: "POST",
      origin: "https://staging.example.com",
      fetchSite: "same-origin",
      appOrigin: "https://staging.example.com",
    }),
    true,
  );
  assert.equal(
    sameOriginMutation({
      method: "POST",
      origin: "https://evil.example",
      fetchSite: "cross-site",
      appOrigin: "https://staging.example.com",
    }),
    false,
  );
  assert.equal(
    sameOriginMutation({
      method: "POST",
      origin: null,
      fetchSite: null,
      appOrigin: "https://staging.example.com",
    }),
    false,
  );
  assert.equal(
    sameOriginMutation({
      method: "GET",
      origin: null,
      fetchSite: "cross-site",
      appOrigin: "https://staging.example.com",
    }),
    false,
  );
  assert.equal(safeReturnPath("https://evil.example"), "/app");
  assert.equal(safeReturnPath("//evil.example"), "/app");
});
