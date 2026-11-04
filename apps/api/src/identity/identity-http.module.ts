import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module.js";
import { MembershipController } from "../membership/membership.controller.js";
import { MembershipService } from "../membership/membership.service.js";
import { DomainExceptionFilter } from "./domain-exception.filter.js";
import { createIdentityVerifier } from "./cognito-identity.verifier.js";
import { IDENTITY_VERIFIER } from "./identity-verifier.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityGuard } from "./identity.guard.js";
import { IdentityService } from "./identity.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController, MembershipController],
  providers: [
    IdentityService,
    MembershipService,
    IdentityGuard,
    DomainExceptionFilter,
    { provide: APP_FILTER, useExisting: DomainExceptionFilter },
    {
      provide: IDENTITY_VERIFIER,
      useFactory: () => createIdentityVerifier(process.env),
    },
  ],
  exports: [IdentityService, MembershipService, IdentityGuard, IDENTITY_VERIFIER],
})
export class IdentityHttpModule {}
