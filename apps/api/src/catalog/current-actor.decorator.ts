import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { CatalogForbiddenError } from "../identity/domain-error.js";

type RequestWithActor = { actorUserId?: string };

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithActor>();
  if (!request.actorUserId) {
    throw new CatalogForbiddenError();
  }
  return request.actorUserId;
});
