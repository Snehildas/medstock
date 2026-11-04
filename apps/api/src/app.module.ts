import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CatalogModule } from "./catalog/catalog.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { EnquiryModule } from "./enquiries/enquiry.module.js";
import { HealthController } from "./health/health.controller.js";
import { SafeExceptionFilter } from "./http/safe-exception.filter.js";
import { ImportModule } from "./imports/import.module.js";
import { IdentityHttpModule } from "./identity/identity-http.module.js";
import { ListingModule } from "./listings/listing.module.js";

@Module({
  imports: [DatabaseModule, IdentityHttpModule, CatalogModule, ListingModule, EnquiryModule, ImportModule],
  controllers: [HealthController],
  providers: [SafeExceptionFilter, { provide: APP_FILTER, useExisting: SafeExceptionFilter }],
})
export class AppModule {}
