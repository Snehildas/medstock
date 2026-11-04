import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { InvalidIdentityError } from "./domain-error.js";
import type { VerifiedIdentity } from "./identity-verifier.js";

type RequestWithIdentity = {
  identity?: VerifiedIdentity;
};

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VerifiedIdentity => {
    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    if (!request.identity) {
      throw new InvalidIdentityError();
    }
    return request.identity;
  },
);
