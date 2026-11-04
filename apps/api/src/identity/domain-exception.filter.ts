import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import type { ApiError } from "@medstock/shared-types";
import { DomainError } from "./domain-error.js";

type HttpResponse = {
  status(code: number): { json(body: ApiError): void };
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    response.status(exception.statusCode).json({
      error: {
        code: exception.code,
        message: exception.message,
      },
    });
  }
}
