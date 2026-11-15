import { rateLimitRequests } from "./rate-limit.middleware.js";
import {
  apiLimitClass,
  clientAddress,
  limitFor,
  rateLimitEnabled,
  resetRateLimits,
  trustedProxyHops,
} from "./rate-limit.js";

describe("rate limiting", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    RATE_LIMIT_DISABLED: process.env.RATE_LIMIT_DISABLED,
    RATE_LIMIT_SEARCH: process.env.RATE_LIMIT_SEARCH,
    RATE_LIMIT_LISTING: process.env.RATE_LIMIT_LISTING,
    RATE_LIMIT_ENQUIRY: process.env.RATE_LIMIT_ENQUIRY,
    RATE_LIMIT_TRUSTED_PROXY_HOPS: process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS,
  };

  afterEach(() => {
    restore("NODE_ENV", previous.NODE_ENV);
    restore("RATE_LIMIT_DISABLED", previous.RATE_LIMIT_DISABLED);
    restore("RATE_LIMIT_SEARCH", previous.RATE_LIMIT_SEARCH);
    restore("RATE_LIMIT_LISTING", previous.RATE_LIMIT_LISTING);
    restore("RATE_LIMIT_ENQUIRY", previous.RATE_LIMIT_ENQUIRY);
    restore("RATE_LIMIT_TRUSTED_PROXY_HOPS", previous.RATE_LIMIT_TRUSTED_PROXY_HOPS);
    resetRateLimits();
  });

  it("ignores a client-supplied forwarding header unless trusted hops are configured", () => {
    expect(
      clientAddress({
        remoteAddress: "10.0.0.8",
        forwardedFor: "203.0.113.9, 10.0.0.8",
        trustedProxyHops: 0,
      }),
    ).toBe("10.0.0.8");
    expect(
      clientAddress({
        remoteAddress: "10.0.0.8",
        forwardedFor: "198.51.100.4, 203.0.113.9",
        trustedProxyHops: 1,
      }),
    ).toBe("203.0.113.9");
    expect(
      clientAddress({
        remoteAddress: "10.0.0.8",
        forwardedFor: "198.51.100.4, 203.0.113.9, 10.0.0.8",
        trustedProxyHops: 2,
      }),
    ).toBe("203.0.113.9");
    expect(trustedProxyHops({ RATE_LIMIT_TRUSTED_PROXY_HOPS: "9" })).toBe(0);
    expect(trustedProxyHops({})).toBe(0);
  });

  it("allows requests below the limit and returns 429 after it", () => {
    process.env.NODE_ENV = "development";
    delete process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_ENQUIRY = "2";
    const responses = [0, 1, 2].map(() => response());
    for (const current of responses) {
      rateLimitRequests(request("POST", "/retailer/enquiries"), current, () => {
        current.statusCode = 200;
      });
    }
    expect(responses[0]?.statusCode).toBe(200);
    expect(responses[1]?.statusCode).toBe(200);
    expect(responses[2]?.statusCode).toBe(429);
    expect(responses[2]?.body).toContain('"code":"rate_limited"');
    expect(responses[2]?.body).not.toContain("203.0.113.9");
    expect(responses[2]?.headers.get("retry-after")).toBeDefined();
    expect(responses[2]?.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps search, listing, and submission policies separate", () => {
    process.env.NODE_ENV = "development";
    delete process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_SEARCH = "1";
    process.env.RATE_LIMIT_LISTING = "2";
    const search = [response(), response()];
    const listing = response();
    rateLimitRequests(request("GET", "/catalog/medicines"), search[0]!, () => {
      search[0]!.statusCode = 200;
    });
    rateLimitRequests(request("GET", "/catalog/medicines?q=para"), search[1]!, () => {
      search[1]!.statusCode = 200;
    });
    rateLimitRequests(request("POST", "/distributor/listings"), listing, () => {
      listing.statusCode = 200;
    });
    expect(search[0]?.statusCode).toBe(200);
    expect(search[1]?.statusCode).toBe(429);
    expect(listing.statusCode).toBe(200);
    expect(apiLimitClass("POST", "/distributor/medicine-submissions")).toBe("submission");
    expect(apiLimitClass("POST", "/distributor/imports/1/commit")).toBe("mutation");
    expect(apiLimitClass("GET", "/distributor/listings")).toBe("default");
    expect(apiLimitClass("POST", "/distributor/imports")).toBe("upload");
    expect(apiLimitClass("GET", "/health/ready")).toBe("health");
  });

  it("uses a socket address when the forwarding header is not trusted", () => {
    process.env.NODE_ENV = "development";
    delete process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = "0";
    process.env.RATE_LIMIT_SEARCH = "1";
    const spoofed = response();
    const again = response();
    const forwarded = "203.0.113.9, 10.0.0.8";
    rateLimitRequests(request("GET", "/catalog/medicines", forwarded), spoofed, () => {
      spoofed.statusCode = 200;
    });
    rateLimitRequests(request("GET", "/catalog/medicines", forwarded), again, () => {
      again.statusCode = 200;
    });
    expect(spoofed.statusCode).toBe(200);
    expect(again.statusCode).toBe(429);
    expect(again.body).not.toContain("203.0.113.9");
  });

  it("stays off in tests, can be disabled in development, and stays on in production", () => {
    expect(rateLimitEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(rateLimitEnabled({ NODE_ENV: "development", RATE_LIMIT_DISABLED: "true" })).toBe(false);
    expect(rateLimitEnabled({ NODE_ENV: "production", RATE_LIMIT_DISABLED: "true" })).toBe(true);
    expect(limitFor({ NODE_ENV: "production" }, "search")).toBe(60);
    expect(limitFor({ NODE_ENV: "development" }, "search")).toBe(600);
    expect(limitFor({ NODE_ENV: "production" }, "upload")).toBe(10);
    expect(limitFor({ NODE_ENV: "development" }, "submission")).toBe(120);
    process.env.NODE_ENV = "test";
    process.env.RATE_LIMIT_SEARCH = "1";
    const first = response();
    const second = response();
    rateLimitRequests(request("GET", "/catalog/medicines"), first, () => {
      first.statusCode = 200;
    });
    rateLimitRequests(request("GET", "/catalog/medicines"), second, () => {
      second.statusCode = 200;
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });
});

function restore(name: "NODE_ENV" | "RATE_LIMIT_DISABLED" | "RATE_LIMIT_SEARCH" | "RATE_LIMIT_LISTING" | "RATE_LIMIT_ENQUIRY" | "RATE_LIMIT_TRUSTED_PROXY_HOPS", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function request(method: string, path: string, forwardedFor?: string) {
  return {
    method,
    path,
    header(name: string) {
      return name.toLowerCase() === "x-forwarded-for" ? forwardedFor : undefined;
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function response() {
  const headers = new Map<string, string>();
  return {
    statusCode: 0,
    headers,
    body: "",
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(body?: string) {
      this.body = body ?? "";
    },
  };
}
