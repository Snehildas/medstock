import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityHttpModule } from "../identity/identity-http.module.js";
import { ImportAdminController, ImportController } from "./import.controller.js";
import { ImportService } from "./import.service.js";

@Module({
  imports: [DatabaseModule, IdentityHttpModule],
  controllers: [ImportController, ImportAdminController],
  providers: [ImportService],
})
export class ImportModule {}
