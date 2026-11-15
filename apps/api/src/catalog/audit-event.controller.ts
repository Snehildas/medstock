import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { PrismaClient } from "@medstock/database";
import type { AuditEventPage } from "@medstock/shared-types";
import { z } from "zod";
import { IdentityGuard } from "../identity/identity.guard.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { listRecentAuditEvents } from "./audit-events.js";
import { PlatformAdminGuard } from "./platform-admin.guard.js";

const pageQueryPipe = new ZodValidationPipe(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
);

@Controller("admin/audit-events")
@UseGuards(IdentityGuard, PlatformAdminGuard)
export class AuditEventController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  list(@Query(pageQueryPipe) query: { page: number; pageSize: number }): Promise<AuditEventPage> {
    return listRecentAuditEvents(this.prisma, query.page, query.pageSize);
  }
}
