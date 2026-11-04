import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { InvalidIdentityError } from "../identity/domain-error.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { CatalogService } from "./catalog.service.js";

type RequestWithActor = {
  identity?: VerifiedIdentity;
  actorUserId?: string;
};

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly identityService: IdentityService,
    private readonly catalogService: CatalogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithActor>();
    if (!request.identity) {
      throw new InvalidIdentityError();
    }
    const user = await this.identityService.provision(request.identity);
    await this.catalogService.assertActivePlatformAdmin(user.id);
    request.actorUserId = user.id;
    return true;
  }
}
