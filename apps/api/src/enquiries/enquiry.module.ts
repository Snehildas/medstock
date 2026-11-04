import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { IdentityHttpModule } from "../identity/identity-http.module.js";
import { EnquiryAdminController } from "./enquiry-admin.controller.js";
import { EnquiryController } from "./enquiry.controller.js";
import { EnquiryService } from "./enquiry.service.js";

@Module({
  imports: [DatabaseModule, IdentityHttpModule],
  controllers: [EnquiryController, EnquiryAdminController],
  providers: [EnquiryService],
})
export class EnquiryModule {}
