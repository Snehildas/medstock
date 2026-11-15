import { Logger } from "@nestjs/common";
import {
  apiLimitClass,
  clientAddress,
  limitFor,
  rateLimitEnabled,
  takeRateLimit,
  trustedProxyHops,
  windowMs,
} from "./rate-limit.js";

const logger = new Logger("rate_limit");

type LimitedRequest = {
  method: string;
  path: string;
  header(name: string): string | undefined;
  socket?: { remoteAddress?: string };
};

type LimitedResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

export function rateLimitRequests(request: LimitedRequest, response: LimitedResponse, next: () => void): void {
  if (!rateLimitEnabled(process.env)) {
    next();
    return;
  }
  const kind = apiLimitClass(request.method.toUpperCase(), request.path);
  const address = clientAddress({
    remoteAddress: request.socket?.remoteAddress,
    forwardedFor: request.header("x-forwarded-for"),
    trustedProxyHops: trustedProxyHops(process.env),
  });
  const decision = takeRateLimit({
    kind,
    address,
    limit: limitFor(process.env, kind),
    now: Date.now(),
    windowMs: windowMs(process.env),
  });
  if (decision.allowed) {
    next();
    return;
  }
  logger.log(JSON.stringify({ event: "rate_limited", method: request.method, path: request.path, kind }));
  response.statusCode = 429;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("retry-after", String(decision.retryAfterSeconds));
  response.setHeader("cache-control", "no-store");
  response.end(
    JSON.stringify({
      error: { code: "rate_limited", message: "Too many requests. Try again shortly." },
    }),
  );
}
