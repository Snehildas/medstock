import assert from "node:assert/strict";
import test from "node:test";
import { createDemoAccessToken, demoPersonaKey, verifyDemoAccessToken } from "@medstock/shared-types";
import { demoAccessTokenActive, loadDemoWebConfig, missingDemoSettings } from "./demo-mode.ts";
import { assertProductionWebConfig } from "./production-config.ts";

const secret = "demo-token-secret-with-32-characters";
const sessionSecret = "demo-session-secret-with-32-characters";

const demoEnv = {
  NODE_ENV: "production",
  MEDSTOCK_DEMO_MODE: "true",
  WEB_ORIGIN: "https://medstock-demo-web.onrender.com",
  API_ORIGIN: "https://medstock-demo-api.onrender.com",
  SESSION_SECRET: sessionSecret,
  MEDSTOCK_DEMO_TOKEN_SECRET: secret,
};

test("demo mode stays off unless the flag is exactly true", () => {
  assert.equal(loadDemoWebConfig({ ...demoEnv, MEDSTOCK_DEMO_MODE: "false" }), null);
  assert.equal(loadDemoWebConfig({ ...demoEnv, MEDSTOCK_DEMO_MODE: "1" }), null);
  assert.equal(demoPersonaKey("PLATFORM_ADMIN"), null);
  assert.equal(demoPersonaKey("retailer"), "retailer");
  assert.ok(loadDemoWebConfig(demoEnv));
});

test("a demo token only accepts the three fixed identities", () => {
  const token = createDemoAccessToken("retailer", secret, 1_000);
  const verified = verifyDemoAccessToken(token, secret, 1_000);
  assert.equal(verified?.subject, "medstock-demo-retailer");
  assert.equal(verifyDemoAccessToken(`${token}x`, secret, 1_000), null);
  assert.equal(verifyDemoAccessToken(token, secret, 1_000 + 60 * 60 * 8 * 1000), null);
  assert.equal(demoAccessTokenActive(token, secret, 1_000), true);
  assert.equal(missingDemoSettings({ MEDSTOCK_DEMO_MODE: "true" }).includes("MEDSTOCK_DEMO_TOKEN_SECRET"), true);
});

test("production demo configuration does not require Cognito and refuses a mix", () => {
  assert.doesNotThrow(() => assertProductionWebConfig(demoEnv));
  assert.throws(() =>
    assertProductionWebConfig({ ...demoEnv, COGNITO_REGION: "ap-south-1" }),
  );
  assert.throws(() => assertProductionWebConfig({ ...demoEnv, MEDSTOCK_LOCAL_PREVIEW: "true" }));
  assert.throws(() => assertProductionWebConfig({ ...demoEnv, AUTH_DEV_MODE: "true" }));
});
