import { Injectable, Logger } from "@nestjs/common";
import {
  IngredientKind,
  MembershipRole,
  MembershipStatus,
  MedicineSubmissionStatus,
  OrganizationStatus,
  OrganizationType,
  PackUnit,
  Prisma,
  PrismaClient,
  StockStatus,
  StrengthUnit,
  normalizeCatalogName,
} from "@medstock/database";
import type { CreateMedicineSubmissionRequest, MedicineSubmissionResponse } from "@medstock/shared-types";
import { formatDecimal } from "../catalog/search-text.js";
import { CatalogService, type SubmittedMedicineInput } from "../catalog/catalog.service.js";
import {
  DuplicatePendingSubmissionError,
  InvalidSubmissionTransitionError,
  SubmissionForbiddenError,
  SubmissionNotFoundError,
} from "../identity/domain-error.js";

const submissionInclude = {
  ingredients: { orderBy: { sequence: "asc" as const } },
  packs: { orderBy: { description: "asc" as const } },
} satisfies Prisma.MedicineSubmissionInclude;

type SubmissionRecord = Prisma.MedicineSubmissionGetPayload<{ include: typeof submissionInclude }>;

const SUBMISSION_NOTICE =
  "Your medicine submission must be approved before it becomes available in the shared medicine directory and can be listed for procurement." as const;

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly catalog: CatalogService,
  ) {}

  async create(
    actorUserId: string,
    organizationId: string,
    input: CreateMedicineSubmissionRequest,
  ): Promise<MedicineSubmissionResponse> {
    const organization = await this.requireDistributor(actorUserId, organizationId);
    const normalized = normalizeCatalogName(input.displayName);
    const pending = await this.prisma.medicineSubmission.findFirst({
      where: {
        organizationId,
        normalizedDisplayName: normalized,
        status: MedicineSubmissionStatus.PENDING_REVIEW,
      },
    });
    if (pending) {
      throw new DuplicatePendingSubmissionError();
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.medicineSubmission.create({
        data: {
          organizationId,
          submittedByUserId: actorUserId,
          status: MedicineSubmissionStatus.PENDING_REVIEW,
          displayName: input.displayName.trim(),
          normalizedDisplayName: normalized,
          brandName: blank(input.brandName),
          genericName: blank(input.genericName),
          dosageForm: input.dosageForm.trim(),
          presentation: blank(input.presentation),
          manufacturerName: blank(input.manufacturerName),
          marketerName: blank(input.marketerName),
          indicativeUnitPrice: input.indicativeUnitPrice,
          minimumOrderQuantity: input.minimumOrderQuantity,
          stockStatus: input.stockStatus as StockStatus,
          availableQuantity: input.availableQuantity ?? null,
          sourceNote: blank(input.sourceNote),
          ingredients: {
            create: input.ingredients.map((line, index) => ({
              ingredientName: line.ingredientName.trim(),
              normalizedName: normalizeCatalogName(line.ingredientName),
              kind: line.kind as IngredientKind,
              strengthValue: line.strengthValue,
              strengthUnit: line.strengthUnit as StrengthUnit,
              basis: blank(line.basis),
              sequence: index + 1,
            })),
          },
          packs: {
            create: input.packs.map((pack) => ({
              description: pack.description.trim(),
              quantity: pack.quantity,
              unit: pack.unit as PackUnit,
            })),
          },
        },
      });
      await tx.medicineSubmissionAuditEvent.create({
        data: {
          actorUserId,
          organizationId,
          submissionId: submission.id,
          action: "submission.create",
        },
      });
      return submission.id;
    });
    this.logger.log(
      `medicine_submission.create actor=${actorUserId} organization=${organization.id} submission=${created}`,
    );
    return this.toResponse(await this.load(created), await this.candidates(normalized, created));
  }

  async listForDistributor(actorUserId: string, organizationId: string, page: number, pageSize: number) {
    await this.requireDistributor(actorUserId, organizationId);
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.medicineSubmission.findMany({
        where,
        include: submissionInclude,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.medicineSubmission.count({ where }),
    ]);
    const responses = [];
    for (const item of items) {
      responses.push(await this.toResponse(item, await this.candidates(item.normalizedDisplayName, item.id)));
    }
    return { items: responses, page, pageSize, total };
  }

  async getForDistributor(actorUserId: string, organizationId: string, submissionId: string) {
    await this.requireDistributor(actorUserId, organizationId);
    const submission = await this.load(submissionId);
    if (submission.organizationId !== organizationId) {
      throw new SubmissionNotFoundError();
    }
    return this.toResponse(submission, await this.candidates(submission.normalizedDisplayName, submission.id));
  }

  async listForAdmin(actorUserId: string, page: number, pageSize: number) {
    await this.catalog.assertActivePlatformAdmin(actorUserId);
    this.logger.log(`platform_admin.medicine_submissions.read actor=${actorUserId}`);
    const where = { status: MedicineSubmissionStatus.PENDING_REVIEW };
    const [items, total] = await Promise.all([
      this.prisma.medicineSubmission.findMany({
        where,
        include: submissionInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.medicineSubmission.count({ where }),
    ]);
    const responses = [];
    for (const item of items) {
      responses.push(await this.toResponse(item, await this.candidates(item.normalizedDisplayName, item.id)));
    }
    return { items: responses, page, pageSize, total };
  }

  async getForAdmin(actorUserId: string, submissionId: string) {
    await this.catalog.assertActivePlatformAdmin(actorUserId);
    const submission = await this.load(submissionId);
    return this.toResponse(submission, await this.candidates(submission.normalizedDisplayName, submission.id));
  }

  async approve(actorUserId: string, submissionId: string): Promise<MedicineSubmissionResponse> {
    await this.catalog.assertActivePlatformAdmin(actorUserId);
    const approvedId = await this.prisma.$transaction(async (tx) => {
      const current = await tx.medicineSubmission.findUnique({
        where: { id: submissionId },
        include: submissionInclude,
      });
      if (!current) {
        throw new SubmissionNotFoundError();
      }
      const claimed = await tx.medicineSubmission.updateMany({
        where: { id: submissionId, status: MedicineSubmissionStatus.PENDING_REVIEW },
        data: {
          status: MedicineSubmissionStatus.APPROVED,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new InvalidSubmissionTransitionError();
      }
      const published = await this.catalog.publishSubmittedMedicine(tx, actorUserId, toCatalogInput(current));
      await tx.medicineSubmission.update({
        where: { id: submissionId },
        data: { approvedMedicineId: published.medicineId },
      });
      await tx.medicineSubmissionAuditEvent.create({
        data: {
          actorUserId,
          organizationId: current.organizationId,
          submissionId,
          action: published.linked ? "submission.link" : "submission.approve",
        },
      });
      return submissionId;
    });
    this.logger.log(`platform_admin.medicine_submission.approve actor=${actorUserId} submission=${submissionId}`);
    const submission = await this.load(approvedId);
    return this.toResponse(submission, await this.candidates(submission.normalizedDisplayName, submission.id));
  }

  async reject(actorUserId: string, submissionId: string, reason: string): Promise<MedicineSubmissionResponse> {
    const reviewReason = reason.trim();
    if (reviewReason.length === 0) {
      throw new InvalidSubmissionTransitionError();
    }
    await this.catalog.assertActivePlatformAdmin(actorUserId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.medicineSubmission.findUnique({ where: { id: submissionId } });
      if (!current) {
        throw new SubmissionNotFoundError();
      }
      const claimed = await tx.medicineSubmission.updateMany({
        where: { id: submissionId, status: MedicineSubmissionStatus.PENDING_REVIEW },
        data: {
          status: MedicineSubmissionStatus.REJECTED,
          reviewReason,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new InvalidSubmissionTransitionError();
      }
      await tx.medicineSubmissionAuditEvent.create({
        data: {
          actorUserId,
          organizationId: current.organizationId,
          submissionId,
          action: "submission.reject",
        },
      });
      return submissionId;
    });
    this.logger.log(`platform_admin.medicine_submission.reject actor=${actorUserId} submission=${submissionId}`);
    const submission = await this.load(updated);
    return this.toResponse(submission, await this.candidates(submission.normalizedDisplayName, submission.id));
  }

  private async requireDistributor(actorUserId: string, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: actorUserId, organizationId } },
      include: { organization: true },
    });
    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      membership.organization.type !== OrganizationType.DISTRIBUTOR ||
      membership.organization.status === OrganizationStatus.SUSPENDED ||
      (membership.role !== MembershipRole.DISTRIBUTOR_OWNER && membership.role !== MembershipRole.DISTRIBUTOR_STAFF)
    ) {
      throw new SubmissionForbiddenError();
    }
    return membership.organization;
  }

  private async load(submissionId: string): Promise<SubmissionRecord> {
    const submission = await this.prisma.medicineSubmission.findUnique({
      where: { id: submissionId },
      include: submissionInclude,
    });
    if (!submission) {
      throw new SubmissionNotFoundError();
    }
    return submission;
  }

  private async candidates(normalizedName: string, submissionId: string) {
    const medicines = await this.prisma.$queryRaw<Array<{ id: string; display_name: string; exact: boolean }>>(
      Prisma.sql`
        SELECT id, display_name, normalized_display_name = ${normalizedName} AS exact
        FROM medicines
        WHERE normalized_display_name = ${normalizedName}
          OR normalized_display_name ILIKE ${`${normalizedName}%`}
          OR word_similarity(${normalizedName}, normalized_display_name) > 0.55
        ORDER BY exact DESC, display_name ASC, id ASC
        LIMIT 8
      `,
    );
    const submissions = await this.prisma.medicineSubmission.findMany({
      where: {
        id: { not: submissionId },
        status: MedicineSubmissionStatus.PENDING_REVIEW,
        OR: [
          { normalizedDisplayName: normalizedName },
          { normalizedDisplayName: { contains: normalizedName } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 8,
    });
    return [
      ...medicines.map((medicine) => ({
        kind: "medicine" as const,
        id: medicine.id,
        displayName: medicine.display_name,
        match: medicine.exact === true || String(medicine.exact) === "t" || String(medicine.exact) === "true" ? ("exact" as const) : ("similar" as const),
      })),
      ...submissions.map((submission) => ({
        kind: "submission" as const,
        id: submission.id,
        displayName: submission.displayName,
        match: submission.normalizedDisplayName === normalizedName ? ("exact" as const) : ("similar" as const),
      })),
    ];
  }

  private async toResponse(
    submission: SubmissionRecord,
    candidates: MedicineSubmissionResponse["candidates"],
  ): Promise<MedicineSubmissionResponse> {
    return {
      id: submission.id,
      organizationId: submission.organizationId,
      status: submission.status,
      displayName: submission.displayName,
      brandName: submission.brandName,
      genericName: submission.genericName,
      dosageForm: submission.dosageForm,
      presentation: submission.presentation,
      manufacturerName: submission.manufacturerName,
      marketerName: submission.marketerName,
      indicativeUnitPrice:
        submission.indicativeUnitPrice == null ? null : formatMoney(submission.indicativeUnitPrice),
      minimumOrderQuantity:
        submission.minimumOrderQuantity == null ? null : formatDecimal(submission.minimumOrderQuantity),
      stockStatus: submission.stockStatus,
      availableQuantity:
        submission.availableQuantity == null ? null : formatDecimal(submission.availableQuantity),
      sourceNote: submission.sourceNote,
      reviewReason: submission.reviewReason,
      reviewedAt: submission.reviewedAt?.toISOString() ?? null,
      approvedMedicineId: submission.approvedMedicineId,
      createdAt: submission.createdAt.toISOString(),
      ingredients: submission.ingredients.map((line) => ({
        ingredientName: line.ingredientName,
        kind: line.kind,
        strengthValue: formatDecimal(line.strengthValue),
        strengthUnit: line.strengthUnit,
        basis: line.basis,
        sequence: line.sequence,
      })),
      packs: submission.packs.map((pack) => ({
        description: pack.description,
        quantity: formatDecimal(pack.quantity),
        unit: pack.unit,
      })),
      candidates,
      notice: SUBMISSION_NOTICE,
    };
  }
}

function toCatalogInput(submission: SubmissionRecord): SubmittedMedicineInput {
  return {
    submissionId: submission.id,
    displayName: submission.displayName,
    brandName: submission.brandName,
    genericName: submission.genericName,
    dosageForm: submission.dosageForm,
    presentation: submission.presentation,
    manufacturerName: submission.manufacturerName,
    marketerName: submission.marketerName,
    ingredients: submission.ingredients.map((line) => ({
      ingredientName: line.ingredientName,
      kind: line.kind,
      strengthValue: formatDecimal(line.strengthValue),
      strengthUnit: line.strengthUnit,
      basis: line.basis,
      sequence: line.sequence,
    })),
    packs: submission.packs.map((pack) => ({
      description: pack.description,
      quantity: formatDecimal(pack.quantity),
      unit: pack.unit,
    })),
  };
}

function formatMoney(value: { toString(): string }): string {
  const [whole, fraction = ""] = value.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function blank(value: string | null | undefined): string | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}
