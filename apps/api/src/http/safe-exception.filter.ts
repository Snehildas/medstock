import { Catch, type ExceptionFilter, HttpException, Logger, type ArgumentsHost } from "@nestjs/common";
import type { ApiError } from "@medstock/shared-types";
import { DomainError } from "../identity/domain-error.js";

type HttpResponse = {
  status(code: number): { json(body: unknown): void };
  getHeader(name: string): string | number | string[] | undefined;
};

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    if (exception instanceof DomainError) {
      response.status(exception.statusCode).json({
        error: { code: exception.code, message: exception.message },
      });
      return;
    }
    if (exception instanceof HttpException && exception.getStatus() < 500) {
      const body = exception.getResponse();
      response.status(exception.getStatus()).json(body);
      return;
    }
    const requestId = response.getHeader("x-request-id");
    this.logger.error(
      JSON.stringify({
        event: "request_failed",
        requestId: typeof requestId === "string" ? requestId : undefined,
        name: exception instanceof Error ? exception.name : "Error",
      }),
    );
    const body: ApiError = {
      error: { code: "internal_error", message: "The request could not be completed." },
    };
    response.status(500).json(body);
  }
}
