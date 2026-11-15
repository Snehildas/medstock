import { Test, type TestingModule } from "@nestjs/testing";
import {
  CatalogStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  UserStatus,
  createPrismaClient,
  normalizeEmail,
  type PrismaClient,
} from "@medstock/database";
import { createMedicineSubmissionSchema } from "@medstock/shared-types";
import { CatalogModule } from "../catalog/catalog.module.js";
import { CatalogService } from "../catalog/catalog.service.js";
import {
  CatalogForbiddenError,
  DuplicatePendingSubmissionError,
  InvalidSubmissionTransitionError,
  PackNotFoundError,
  SubmissionForbiddenError,
  SubmissionNotFoundError,
} from "../identity/domain-error.js";
import { DatabaseModule } from "../database/database.module.js";
import { ListingModule } from "../listings/listing.module.js";
import { ListingService } from "../listings/listing.service.js";
import { SubmissionModule } from "./submission.module.js";
import { SubmissionService } from "./submission.service.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";
const testRun = `submission-${Date.now()}`;

function email(label: string): string {
  return normalizeEmail(`${label}.${testRun}@example.test`);
}

function label(value: string): string {
  return `${value} ${testRun}`;
}

describe("medicine submissions", () => {
  let prisma: PrismaClient;
  let submissions: SubmissionService;
  let catalog: CatalogService;
  let listings: ListingService;
  let moduleRef: TestingModule;
  let ownerId: string;
  let otherOwnerId: string;
  let adminId: string;
  let distributorId: string;
  let otherDistributorId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, CatalogModule, ListingModule, SubmissionModule],
    }).compile();
    submissions = moduleRef.get(SubmissionService);
    catalog = moduleRef.get(CatalogService);
    listings = moduleRef.get(ListingService);
    ownerId = (await prisma.user.create({ data: { email: email("owner"), status: UserStatus.ACTIVE } })).id;
    otherOwnerId = (await prisma.user.create({ data: { email: email("other"), status: UserStatus.ACTIVE } })).id;
    adminId = (await prisma.user.create({ data: { email: email("admin"), status: UserStatus.ACTIVE } })).id;
    distributorId = await organization("own", OrganizationType.DISTRIBUTOR);
    otherDistributorId = await organization("other", OrganizationType.DISTRIBUTOR);
    const platformId = await organization("platform", OrganizationType.PLATFORM);
    await membership(ownerId, distributorId, MembershipRole.DISTRIBUTOR_OWNER);
    await membership(otherOwnerId, otherDistributorId, MembershipRole.DISTRIBUTOR_OWNER);
    await membership(adminId, platformId, MembershipRole.PLATFORM_ADMIN);
  });

  afterAll(async () => {
    await moduleRef.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.listingAuditEvent.deleteMany({ where: { organization: { slug: { contains: testRun } } } });
    await prisma.distributorListing.deleteMany({ where: { organization: { slug: { contains: testRun } } } });
    await prisma.medicineSubmissionAuditEvent.deleteMany({ where: { organization: { slug: { contains: testRun } } } });
    await prisma.medicineSubmissionIngredient.deleteMany({ where: { submission: { organization: { slug: { contains: testRun } } } } });
    await prisma.medicineSubmissionPack.deleteMany({ where: { submission: { organization: { slug: { contains: testRun } } } } });
    await prisma.medicineSubmission.deleteMany({ where: { organization: { slug: { contains: testRun } } } });
    await prisma.medicineComposition.deleteMany({ where: { medicine: { normalizedDisplayName: { contains: testRun } } } });
    await prisma.medicineManufacturer.deleteMany({ where: { medicine: { normalizedDisplayName: { contains: testRun } } } });
    await prisma.medicinePack.deleteMany({ where: { medicine: { normalizedDisplayName: { contains: testRun } } } });
    await prisma.catalogAuditEvent.deleteMany({ where: { actor: { email: { contains: testRun } } } });
    await prisma.medicine.deleteMany({ where: { normalizedDisplayName: { contains: testRun } } });
    await prisma.ingredient.deleteMany({ where: { normalizedName: { contains: testRun } } });
    await prisma.manufacturer.deleteMany({ where: { normalizedName: { contains: testRun } } });
  });

  it("accepts a multi-ingredient submission and rejects an invalid one", async () => {
    const created = await submissions.create(ownerId, distributorId, payload(label("Combo Tablet")));
    expect(created.status).toBe("PENDING_REVIEW");
    expect(created.ingredients).toHaveLength(2);
    expect(created.packs).toHaveLength(2);
    expect(created.indicativeUnitPrice).toBe("18.50");
    expect(created.minimumOrderQuantity).toBe("4");
    expect(created.stockStatus).toBe("IN_STOCK");
    expect(created.approvedMedicineId).toBeNull();
    expect(created.notice).toContain("must be approved");
    const audit = await prisma.medicineSubmissionAuditEvent.findFirst({
      where: { submissionId: created.id, action: "submission.create" },
    });
    expect(audit?.actorUserId).toBe(ownerId);
    await expect(submissions.create(ownerId, distributorId, payload(label("Combo Tablet")))).rejects.toBeInstanceOf(
      DuplicatePendingSubmissionError,
    );
    const invalid = createMedicineSubmissionSchema.safeParse({
      ...payload(label("Bad")),
      ingredients: [{ ingredientName: label("Salt"), kind: "ACTIVE", strengthValue: "0", strengthUnit: "MG" }],
    });
    expect(invalid.success).toBe(false);
    const badPrice = createMedicineSubmissionSchema.safeParse({
      ...payload(label("Price")),
      indicativeUnitPrice: "1.234",
      minimumOrderQuantity: "1.5",
    });
    expect(badPrice.success).toBe(false);
    await expect(submissions.create(otherOwnerId, distributorId, payload(label("Cross")))).rejects.toBeInstanceOf(
      SubmissionForbiddenError,
    );
    await expect(submissions.getForDistributor(otherOwnerId, otherDistributorId, created.id)).rejects.toBeInstanceOf(
      SubmissionNotFoundError,
    );
    await expect(catalog.createMedicine(ownerId, {
      displayName: label("Direct"),
      genericName: label("Direct"),
      dosageForm: "Tablet",
    })).rejects.toBeInstanceOf(CatalogForbiddenError);
    await expect(submissions.approve(ownerId, created.id)).rejects.toBeInstanceOf(CatalogForbiddenError);
  });

  it("approves into the catalog, rejects with a reason, and blocks a second approval", async () => {
    const similar = await prisma.medicine.create({
      data: {
        displayName: label("Known Tablet Extra"),
        normalizedDisplayName: label("known tablet extra").toLowerCase(),
        genericName: label("Known"),
        dosageForm: "Tablet",
        status: CatalogStatus.PUBLISHED,
        searchVisible: true,
        searchText: label("known tablet extra").toLowerCase(),
      },
    });
    const pending = await submissions.create(ownerId, distributorId, payload(label("Known Tablet")));
    expect(pending.candidates.some((candidate) => candidate.id === similar.id)).toBe(true);
    const approved = await submissions.approve(adminId, pending.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedMedicineId).toBeTruthy();
    const medicine = await prisma.medicine.findUniqueOrThrow({
      where: { id: approved.approvedMedicineId ?? "" },
      include: { compositions: true, packs: true, companies: true },
    });
    expect(medicine.status).toBe("PUBLISHED");
    expect(medicine.searchVisible).toBe(true);
    expect(medicine.compositions).toHaveLength(2);
    expect(medicine.packs).toHaveLength(2);
    expect(medicine.companies).toHaveLength(1);
    expect(approved.indicativeUnitPrice).toBe("18.50");
    expect(approved.minimumOrderQuantity).toBe("4");
    expect(await prisma.distributorListing.count({ where: { organizationId: distributorId } })).toBe(0);
    const pack = medicine.packs[0];
    if (!pack) {
      throw new Error("approved medicine has no pack");
    }
    const listing = await listings.create(ownerId, distributorId, {
      medicinePackId: pack.id,
      unitPrice: "12.50",
      currency: "INR",
      minimumOrderQuantity: "2",
      stockStatus: "IN_STOCK",
    });
    expect(listing.medicinePackId).toBe(pack.id);
    await expect(listings.create(ownerId, distributorId, {
      medicinePackId: pending.id,
      unitPrice: "1",
      currency: "INR",
      minimumOrderQuantity: "1",
      stockStatus: "UNKNOWN",
    })).rejects.toBeInstanceOf(PackNotFoundError);
    const race = await submissions.create(ownerId, distributorId, payload(label("Race Tablet")));
    const settled = await Promise.allSettled([
      submissions.approve(adminId, race.id),
      submissions.approve(adminId, race.id),
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.medicine.count({ where: { normalizedDisplayName: label("race tablet").toLowerCase() } })).toBe(1);
    const rejected = await submissions.create(ownerId, distributorId, payload(label("Rejected Syrup"), "Syrup"));
    await expect(submissions.reject(adminId, rejected.id, "")).rejects.toThrow();
    const decision = await submissions.reject(adminId, rejected.id, "Name is incomplete.");
    expect(decision.status).toBe("REJECTED");
    expect(decision.reviewReason).toBe("Name is incomplete.");
    const rejectAudit = await prisma.medicineSubmissionAuditEvent.findFirst({
      where: { submissionId: rejected.id, action: "submission.reject" },
    });
    expect(rejectAudit?.actorUserId).toBe(adminId);
    await expect(submissions.approve(adminId, rejected.id)).rejects.toBeInstanceOf(InvalidSubmissionTransitionError);
  });

  it("links an exact published medicine instead of creating another", async () => {
    const existing = await prisma.medicine.create({
      data: {
        displayName: label("Exact Match"),
        normalizedDisplayName: label("exact match").toLowerCase(),
        genericName: label("Exact"),
        dosageForm: "Tablet",
        status: CatalogStatus.PUBLISHED,
        searchVisible: true,
        searchText: label("exact match").toLowerCase(),
      },
    });
    const submission = await submissions.create(ownerId, distributorId, payload(label("Exact Match")));
    expect(submission.candidates.some((candidate) => candidate.match === "exact" && candidate.id === existing.id)).toBe(true);
    const linked = await submissions.approve(adminId, submission.id);
    expect(linked.approvedMedicineId).toBe(existing.id);
    expect(await prisma.medicine.count({ where: { normalizedDisplayName: label("exact match").toLowerCase() } })).toBe(1);
  });

  function payload(displayName: string, dosageForm = "Tablet") {
    return {
      displayName,
      brandName: label("Brand"),
      genericName: null,
      dosageForm,
      presentation: null,
      manufacturerName: label("Maker"),
      marketerName: null,
      indicativeUnitPrice: "18.50",
      minimumOrderQuantity: "4",
      stockStatus: "IN_STOCK" as const,
      availableQuantity: "12",
      sourceNote: "counter stock",
      ingredients: [
        { ingredientName: label("Amoxicillin"), kind: "ACTIVE" as const, strengthValue: "500", strengthUnit: "MG" as const, basis: null },
        { ingredientName: label("Clavulanic Acid"), kind: "SALT" as const, strengthValue: "125", strengthUnit: "MG" as const, basis: "per tablet" },
      ],
      packs: [
        { description: label("Strip of 10"), quantity: "10", unit: "TABLET" as const },
        { description: label("Bottle of 100"), quantity: "100", unit: "TABLET" as const },
      ],
    };
  }

  async function organization(name: string, type: OrganizationType): Promise<string> {
    const row = await prisma.organization.create({
      data: {
        name: label(name),
        slug: `${name}-${testRun}`,
        type,
        status: OrganizationStatus.ACTIVE,
      },
    });
    return row.id;
  }

  async function membership(userId: string, organizationId: string, role: MembershipRole): Promise<void> {
    await prisma.organizationMembership.create({
      data: { userId, organizationId, role, status: MembershipStatus.ACTIVE },
    });
  }
});
