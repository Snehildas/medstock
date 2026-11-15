import assert from "node:assert/strict";
import test from "node:test";
import {
  clientAddress,
  limitFor,
  rateLimitEnabled,
  resetRateLimits,
  takeRateLimit,
  trustedProxyHops,
  webLimitClass,
} from "./rate-limit.ts";

test("forwarding headers are ignored unless a trusted hop count is set", () => {
  assert.equal(
    clientAddress({
      remoteAddress: "10.1.1.1",
      forwardedFor: "203.0.113.8, 10.1.1.1",
      trustedProxyHops: 0,
    }),
    "10.1.1.1",
  );
  assert.equal(
    clientAddress({
      remoteAddress: "10.1.1.1",
      forwardedFor: "198.51.100.20, 203.0.113.8",
      trustedProxyHops: 1,
    }),
    "203.0.113.8",
  );
});

test("search and enquiry calls are limited and ordinary reads are not", () => {
  assert.equal(webLimitClass("GET", "/catalog/medicines?q=para"), "search");
  assert.equal(webLimitClass("POST", "/retailer/enquiries?organizationId=1"), "enquiry");
  assert.equal(webLimitClass("GET", "/api/auth/sign-in"), "auth");
  assert.equal(webLimitClass("POST", "/distributor/listings"), "listing");
  assert.equal(webLimitClass("POST", "/distributor/medicine-submissions"), "submission");
  assert.equal(webLimitClass("POST", "/distributor/imports/1/cancel"), "mutation");
  assert.equal(webLimitClass("GET", "/distributor/listings"), null);
  assert.equal(rateLimitEnabled({ NODE_ENV: "test" }), false);
  assert.equal(rateLimitEnabled({ NODE_ENV: "development", RATE_LIMIT_DISABLED: "true" }), false);
  assert.equal(rateLimitEnabled({ NODE_ENV: "production", RATE_LIMIT_DISABLED: "true" }), true);
  assert.equal(limitFor({ NODE_ENV: "production" }, "upload"), 10);
  assert.equal(limitFor({ NODE_ENV: "development" }, "search"), 600);
  assert.equal(trustedProxyHops({ RATE_LIMIT_TRUSTED_PROXY_HOPS: "nope" }), 0);
});

test("a caller stays under the limit until the window is exhausted", () => {
  resetRateLimits();
  const first = takeRateLimit({ kind: "enquiry", address: "10.0.0.8", limit: 2, now: 1_000, windowMs: 60_000 });
  const second = takeRateLimit({ kind: "enquiry", address: "10.0.0.8", limit: 2, now: 1_100, windowMs: 60_000 });
  const third = takeRateLimit({ kind: "enquiry", address: "10.0.0.8", limit: 2, now: 1_200, windowMs: 60_000 });
  const otherPolicy = takeRateLimit({ kind: "listing", address: "10.0.0.8", limit: 2, now: 1_200, windowMs: 60_000 });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  if (!third.allowed) {
    assert.ok(third.retryAfterSeconds >= 1);
  }
  assert.equal(otherPolicy.allowed, true);
  resetRateLimits();
});
