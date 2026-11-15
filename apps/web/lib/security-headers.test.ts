import assert from "node:assert/strict";
import test from "node:test";
import { webSecurityHeaders } from "./security-headers.ts";

test("web security headers avoid a script policy and add HSTS only in production", () => {
  const development = webSecurityHeaders("development");
  assert.equal(development.some((header) => header.key === "Strict-Transport-Security"), false);
  assert.equal(
    development.find((header) => header.key === "Content-Security-Policy")?.value,
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );
  assert.equal(development.some((header) => header.value.includes("script-src")), false);
  const production = webSecurityHeaders("production");
  assert.equal(
    production.find((header) => header.key === "Strict-Transport-Security")?.value,
    "max-age=15552000; includeSubDomains",
  );
});
