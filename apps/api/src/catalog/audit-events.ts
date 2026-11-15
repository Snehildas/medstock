import { PrismaClient } from "@medstock/database";
import { auditEventPageSchema, type AuditEventPage } from "@medstock/shared-types";

export async function listRecentAuditEvents(
  prisma: PrismaClient,
  page: number,
  pageSize: number,
): Promise<AuditEventPage> {
  const [catalog, submissions, listings, enquiries, catalogCount, submissionCount, listingCount, enquiryCount] =
    await Promise.all([
      prisma.catalogAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.medicineSubmissionAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.listingAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.procurementEnquiryAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.catalogAuditEvent.count(),
      prisma.medicineSubmissionAuditEvent.count(),
      prisma.listingAuditEvent.count(),
      prisma.procurementEnquiryAuditEvent.count(),
    ]);
  const items = [
    ...catalog.map((event) => ({ id: event.id, area: "catalog" as const, action: event.action, createdAt: event.createdAt })),
    ...submissions.map((event) => ({ id: event.id, area: "submission" as const, action: event.action, createdAt: event.createdAt })),
    ...listings.map((event) => ({ id: event.id, area: "listing" as const, action: event.action, createdAt: event.createdAt })),
    ...enquiries.map((event) => ({ id: event.id, area: "enquiry" as const, action: event.action, createdAt: event.createdAt })),
  ]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice((page - 1) * pageSize, page * pageSize)
    .map((event) => ({ ...event, createdAt: event.createdAt.toISOString() }));
  return auditEventPageSchema.parse({
    items,
    page,
    pageSize,
    total: catalogCount + submissionCount + listingCount + enquiryCount,
  });
}
