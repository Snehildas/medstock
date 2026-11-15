import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityHttpModule } from "../identity/identity-http.module.js";
import { AuditEventController } from "./audit-event.controller.js";
import { CatalogAdminController } from "./catalog-admin.controller.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { PlatformAdminGuard } from "./platform-admin.guard.js";

@Module({
  imports: [DatabaseModule, IdentityHttpModule],
  controllers: [CatalogController, CatalogAdminController, AuditEventController],
  providers: [CatalogService, PlatformAdminGuard],
  exports: [CatalogService],
})
export class CatalogModule {}
