import { requestContext } from "./request-context.js";

describe("request security headers", () => {
  it("sets framing and cache headers without logging the request body", () => {
    const headers = new Map<string, string>();
    const request = {
      header: () => undefined,
      method: "GET",
      path: "/health",
    };
    const response = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
      on() {
        return undefined;
      },
      statusCode: 200,
    };
    requestContext(request, response, () => undefined);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});
