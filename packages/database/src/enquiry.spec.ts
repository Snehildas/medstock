import {
  CatalogStatus,
  EnquiryStatus,
  ListingCurrency,
  OrganizationType,
  PackUnit,
  StockStatus,
  UserStatus,
  createPrismaClient,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";
const prisma = createPrismaClient(databaseUrl);
const testRun = `enquiry-${Date.now()}`;

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.procurementEnquiryAuditEvent.deleteMany({
    where: { enquiry: { message: testRun } },
  });
  await prisma.procurementEnquiry.deleteMany({ where: { message: testRun } });
  await prisma.distributorListing.deleteMany({
    where: { medicinePack: { description: { contains: testRun } } },
  });
  await prisma.medicinePack.deleteMany({ where: { description: { contains: testRun } } });
  await prisma.medicine.deleteMany({ where: { normalizedDisplayName: { contains: testRun } } });
  await prisma.organizationMembership.deleteMany({
    where: { user: { email: { contains: testRun } } },
  });
  await prisma.user.deleteMany({ where: { email: { contains: testRun } } });
  await prisma.organization.deleteMany({ where: { slug: { contains: testRun } } });
});

describe("procurement enquiries", () => {
  it("keeps the listing and the creator while an enquiry or its audit points at them", async () => {
    const user = await prisma.user.create({
      data: { email: `buyer.${testRun}@example.test`, status: UserStatus.ACTIVE },
    });
    const retailer = await prisma.organization.create({
      data: { name: "Retailer", slug: `retailer-${testRun}`, type: OrganizationType.RETAILER },
    });
    const distributor = await prisma.organization.create({
      data: { name: "Distributor", slug: `distributor-${testRun}`, type: OrganizationType.DISTRIBUTOR },
    });
    const medicine = await prisma.medicine.create({
      data: {
        displayName: `Medicine ${testRun}`,
        normalizedDisplayName: `medicine ${testRun}`,
        genericName: "Generic",
        dosageForm: "Tablet",
        status: CatalogStatus.PUBLISHED,
        searchVisible: true,
      },
    });
    const pack = await prisma.medicinePack.create({
      data: {
        medicineId: medicine.id,
        description: `Pack ${testRun}`,
        quantity: "10",
        unit: PackUnit.TABLET,
      },
    });
    const listing = await prisma.distributorListing.create({
      data: {
        organizationId: distributor.id,
        medicinePackId: pack.id,
        unitPrice: "10",
        currency: ListingCurrency.INR,
        minimumOrderQuantity: "1",
        stockStatus: StockStatus.UNKNOWN,
      },
    });
    const enquiry = await prisma.procurementEnquiry.create({
      data: {
        retailerOrganizationId: retailer.id,
        distributorOrganizationId: distributor.id,
        listingId: listing.id,
        requestedQuantity: 2,
        message: testRun,
        status: EnquiryStatus.OPEN,
        createdByUserId: user.id,
      },
    });
    await prisma.procurementEnquiryAuditEvent.create({
      data: {
        actorUserId: user.id,
        retailerOrganizationId: retailer.id,
        distributorOrganizationId: distributor.id,
        enquiryId: enquiry.id,
        action: "enquiry.create",
      },
    });

    await expect(prisma.distributorListing.delete({ where: { id: listing.id } })).rejects.toMatchObject({
      code: "P2003",
    });
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });
});
