import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { InvalidIdentityError } from "./domain-error.js";
import { IDENTITY_VERIFIER, type IdentityVerifier, type VerifiedIdentity } from "./identity-verifier.js";

type RequestWithIdentity = {
  headers: { authorization?: string };
  identity?: VerifiedIdentity;
};

@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(@Inject(IDENTITY_VERIFIER) private readonly verifier: IdentityVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithIdentity>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new InvalidIdentityError();
    }
    const accessToken = header.slice("Bearer ".length).trim();
    if (accessToken.length === 0) {
      throw new InvalidIdentityError();
    }
    request.identity = await this.verifier.verify(accessToken);
    return true;
  }
}
