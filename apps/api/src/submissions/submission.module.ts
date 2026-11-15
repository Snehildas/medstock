import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityHttpModule } from "../identity/identity-http.module.js";
import { SubmissionAdminController } from "./submission-admin.controller.js";
import { SubmissionController } from "./submission.controller.js";
import { SubmissionService } from "./submission.service.js";

@Module({
  imports: [DatabaseModule, IdentityHttpModule, CatalogModule],
  controllers: [SubmissionController, SubmissionAdminController],
  providers: [SubmissionService],
})
export class SubmissionModule {}
