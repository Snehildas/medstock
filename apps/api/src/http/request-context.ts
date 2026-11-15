import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";

const logger = new Logger("http");
const requestIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

type IncomingRequest = {
  header(name: string): string | undefined;
  method: string;
  path: string;
};

type OutgoingResponse = {
  setHeader(name: string, value: string): void;
  on(event: "finish", listener: () => void): void;
  statusCode: number;
};

export function requestContext(request: IncomingRequest, response: OutgoingResponse, next: () => void): void {
  const incoming = request.header("x-request-id") ?? "";
  const requestId = requestIdPattern.test(incoming) ? incoming : randomUUID();
  response.setHeader("x-request-id", requestId);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cache-Control", "no-store");
  const started = Date.now();
  response.on("finish", () => {
    logger.log(
      JSON.stringify({
        event: "http_request",
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Date.now() - started,
      }),
    );
  });
  next();
}
