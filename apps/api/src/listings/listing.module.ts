import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityHttpModule } from "../identity/identity-http.module.js";
import { ListingAdminController } from "./listing-admin.controller.js";
import { ListingController } from "./listing.controller.js";
import { ListingService } from "./listing.service.js";

@Module({
  imports: [DatabaseModule, IdentityHttpModule],
  controllers: [ListingController, ListingAdminController],
  providers: [ListingService],
  exports: [ListingService],
})
export class ListingModule {}
