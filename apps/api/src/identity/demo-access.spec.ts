import { createDemoAccessToken } from "@medstock/shared-types";
import {
  CatalogStatus,
  createPrismaClient,
  IdentityProvider,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  PackUnit,
  UserStatus,
  type PrismaClient,
} from "@medstock/database";
import { CatalogService } from "../catalog/catalog.service.js";
import { listRecentAuditEvents } from "../catalog/audit-events.js";
import { EnquiryService } from "../enquiries/enquiry.service.js";
import { CatalogForbiddenError, EnquiryForbiddenError, ListingForbiddenError } from "../identity/domain-error.js";
import { DemoIdentityVerifier } from "./demo-identity.verifier.js";
import { createIdentityVerifier, UnconfiguredIdentityVerifier } from "./cognito-identity.verifier.js";
import { ListingService } from "../listings/listing.service.js";
import { SubmissionService } from "../submissions/submission.service.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5433/medstock";
const secret = "demo-token-secret-with-32-characters";
const testRun = `demo-flow-${Date.now()}`;

describe("demo identity", () => {
  it("stays closed unless demo mode is explicitly enabled", async () => {
    const closed = createIdentityVerifier({ NODE_ENV: "test" });
    expect(closed).toBeInstanceOf(UnconfiguredIdentityVerifier);
    await expect(closed.verify(createDemoAccessToken("retailer", secret))).rejects.toThrow();
    expect(() =>
      createIdentityVerifier({
        NODE_ENV: "production",
        MEDSTOCK_DEMO_MODE: "true",
        MEDSTOCK_DEMO_TOKEN_SECRET: secret,
        COGNITO_REGION: "ap-south-1",
      }),
    ).toThrow(/Cognito/);
    const verifier = new DemoIdentityVerifier(secret);
    const retailer = await verifier.verify(createDemoAccessToken("retailer", secret));
    expect(retailer.subject).toBe("medstock-demo-retailer");
    await expect(verifier.verify(`${createDemoAccessToken("administrator", secret)}tampered`)).rejects.toThrow();
  });

  it("persists retailer, distributor, and administrator actions and rejects another organization", async () => {
    const prisma = createPrismaClient(databaseUrl);
    const listings = new ListingService(prisma);
    const enquiries = new EnquiryService(prisma);
    const catalog = new CatalogService(prisma);
    const submissions = new SubmissionService(prisma, catalog);
    const retailerOrgId = crypto.randomUUID();
    const otherRetailerOrgId = crypto.randomUUID();
    const distributorOrgId = crypto.randomUUID();
    const platformOrgId = crypto.randomUUID();
    const retailerId = crypto.randomUUID();
    const otherRetailerId = crypto.randomUUID();
    const distributorId = crypto.randomUUID();
    const adminId = crypto.randomUUID();
    const medicineId = crypto.randomUUID();
    const packId = crypto.randomUUID();
    let listingId = "";
    let enquiryId = "";
    let submissionId = "";
    let approvedMedicineId = "";
    try {
      await organization(prisma, retailerOrgId, OrganizationType.RETAILER);
      await organization(prisma, otherRetailerOrgId, OrganizationType.RETAILER);
      await organization(prisma, distributorOrgId, OrganizationType.DISTRIBUTOR);
      await organization(prisma, platformOrgId, OrganizationType.PLATFORM);
      await user(prisma, retailerId, retailerOrgId, MembershipRole.RETAILER_OWNER);
      await user(prisma, otherRetailerId, otherRetailerOrgId, MembershipRole.RETAILER_OWNER);
      await user(prisma, distributorId, distributorOrgId, MembershipRole.DISTRIBUTOR_OWNER);
      await user(prisma, adminId, platformOrgId, MembershipRole.PLATFORM_ADMIN);
      await prisma.medicine.create({
        data: {
          id: medicineId,
          displayName: `Sample ${testRun}`,
          normalizedDisplayName: `sample ${testRun}`,
          genericName: "Samplecet",
          dosageForm: "Tablet",
          status: CatalogStatus.PUBLISHED,
          searchVisible: true,
          sourceLabel: "illustrative-demo",
          searchText: `sample ${testRun}`,
          packs: { create: { id: packId, description: "Strip of 10", quantity: "10", unit: PackUnit.TABLET } },
        },
      });
      const listing = await listings.create(distributorId, distributorOrgId, {
        medicinePackId: packId,
        unitPrice: "21.00",
        currency: "INR",
        minimumOrderQuantity: "1",
        stockStatus: "IN_STOCK",
        availableQuantity: "5",
        sourceNote: "Illustrative sample stock.",
      });
      listingId = listing.id;
      await expect(listings.create(retailerId, distributorOrgId, {
        medicinePackId: packId,
        unitPrice: "21.00",
        currency: "INR",
        minimumOrderQuantity: "1",
        stockStatus: "IN_STOCK",
      })).rejects.toBeInstanceOf(ListingForbiddenError);
      const enquiry = await enquiries.create(retailerId, retailerOrgId, {
        listingId,
        requestedPackQuantity: 2,
        message: "Illustrative enquiry.",
      });
      enquiryId = enquiry.id;
      await expect(enquiries.getForRetailer(otherRetailerId, enquiryId)).rejects.toBeInstanceOf(EnquiryForbiddenError);
      const responded = await enquiries.respond(distributorId, enquiryId, "Illustrative reply.");
      expect(responded.status).toBe("RESPONDED");
      const created = await submissions.create(distributorId, distributorOrgId, {
        displayName: `Pending ${testRun}`,
        genericName: "Sampletone",
        dosageForm: "Tablet",
        indicativeUnitPrice: "10.00",
        minimumOrderQuantity: "1",
        stockStatus: "UNKNOWN",
        sourceNote: "Illustrative submission.",
        ingredients: [{ ingredientName: `Salt ${testRun}`, kind: "SALT", strengthValue: "10", strengthUnit: "MG" }],
        packs: [{ description: "Strip of 10", quantity: "10", unit: "TABLET" }],
      });
      submissionId = created.id;
      const approved = await submissions.approve(adminId, submissionId);
      approvedMedicineId = approved.approvedMedicineId ?? "";
      expect(approved.status).toBe("APPROVED");
      const audits = await listRecentAuditEvents(prisma, 1, 20);
      expect(audits.items.some((event) => event.action === "submission.approve")).toBe(true);
      await expect(catalog.assertActivePlatformAdmin(retailerId)).rejects.toBeInstanceOf(CatalogForbiddenError);
    } finally {
      await cleanup(prisma, {
        enquiryId,
        listingId,
        submissionId,
        medicineId,
        approvedMedicineId,
        userIds: [retailerId, otherRetailerId, distributorId, adminId],
        organizationIds: [retailerOrgId, otherRetailerOrgId, distributorOrgId, platformOrgId],
      });
      await prisma.$disconnect();
    }
  });
});

async function organization(prisma: PrismaClient, id: string, type: OrganizationType): Promise<void> {
  await prisma.organization.create({
    data: {
      id,
      name: `${type} ${testRun}`,
      slug: `${type.toLowerCase()}-${id.slice(0, 8)}`,
      type,
      status: OrganizationStatus.ACTIVE,
    },
  });
}

async function user(prisma: PrismaClient, id: string, organizationId: string, role: MembershipRole): Promise<void> {
  await prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      name: "Demo Flow",
      status: UserStatus.ACTIVE,
      identityAccounts: {
        create: { provider: IdentityProvider.COGNITO, providerSubject: `subject-${id}` },
      },
      memberships: {
        create: { organizationId, role, status: MembershipStatus.ACTIVE },
      },
    },
  });
}

async function cleanup(
  prisma: PrismaClient,
  ids: {
    enquiryId: string;
    listingId: string;
    submissionId: string;
    medicineId: string;
    approvedMedicineId: string;
    userIds: string[];
    organizationIds: string[];
  },
): Promise<void> {
  const medicineIds = [ids.medicineId, ids.approvedMedicineId].filter((id) => id.length > 0);
  if (ids.enquiryId) {
    await prisma.procurementEnquiryAuditEvent.deleteMany({ where: { enquiryId: ids.enquiryId } });
    await prisma.procurementEnquiry.deleteMany({ where: { id: ids.enquiryId } });
  }
  if (ids.listingId) {
    await prisma.listingAuditEvent.deleteMany({ where: { listingId: ids.listingId } });
    await prisma.distributorListing.deleteMany({ where: { id: ids.listingId } });
  }
  if (ids.submissionId) {
    await prisma.medicineSubmissionAuditEvent.deleteMany({ where: { submissionId: ids.submissionId } });
    await prisma.medicineSubmissionIngredient.deleteMany({ where: { submissionId: ids.submissionId } });
    await prisma.medicineSubmissionPack.deleteMany({ where: { submissionId: ids.submissionId } });
    await prisma.medicineSubmission.deleteMany({ where: { id: ids.submissionId } });
  }
  await prisma.catalogAuditEvent.deleteMany({ where: { actorUserId: { in: ids.userIds } } });
  if (medicineIds.length > 0) {
    await prisma.catalogAuditEvent.deleteMany({ where: { entityId: { in: medicineIds } } });
    await prisma.medicineComposition.deleteMany({ where: { medicineId: { in: medicineIds } } });
    await prisma.medicineManufacturer.deleteMany({ where: { medicineId: { in: medicineIds } } });
    await prisma.medicinePack.deleteMany({ where: { medicineId: { in: medicineIds } } });
    await prisma.medicine.deleteMany({ where: { id: { in: medicineIds } } });
  }
  await prisma.ingredient.deleteMany({ where: { normalizedName: `salt ${testRun}` } });
  await prisma.organizationMembership.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.identityAccount.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: ids.organizationIds } } });
}
