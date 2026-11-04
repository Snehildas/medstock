import {
  CatalogStatus,
  ListingCurrency,
  ListingImportStatus,
  OrganizationType,
  PackUnit,
  StockStatus,
  UserStatus,
  createPrismaClient,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";
const prisma = createPrismaClient(databaseUrl);
const testRun = `import-${Date.now()}`;

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.listingAuditEvent.deleteMany({
    where: { organization: { slug: { contains: testRun } } },
  });
  await prisma.listingImportAuditEvent.deleteMany({
    where: { organization: { slug: { contains: testRun } } },
  });
  await prisma.listingImportRow.deleteMany({
    where: { import: { organization: { slug: { contains: testRun } } } },
  });
  await prisma.listingImport.deleteMany({
    where: { organization: { slug: { contains: testRun } } },
  });
  await prisma.distributorListing.deleteMany({
    where: { organization: { slug: { contains: testRun } } },
  });
  await prisma.medicinePack.deleteMany({ where: { description: { contains: testRun } } });
  await prisma.medicine.deleteMany({ where: { normalizedDisplayName: { contains: testRun } } });
  await prisma.user.deleteMany({ where: { email: { contains: testRun } } });
  await prisma.organization.deleteMany({ where: { slug: { contains: testRun } } });
});

describe("listing imports", () => {
  it("keeps the distributor, uploader, and pack while an import points at them", async () => {
    const user = await prisma.user.create({
      data: { email: `importer.${testRun}@example.test`, status: UserStatus.ACTIVE },
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
    const imported = await prisma.listingImport.create({
      data: {
        organizationId: distributor.id,
        uploadedByUserId: user.id,
        fileName: "listings.csv",
        checksum: `checksum-${testRun}`,
        byteSize: 12,
        status: ListingImportStatus.PREVIEW_READY,
        rows: {
          create: {
            rowNumber: 2,
            matchedPackId: pack.id,
            existingListingId: listing.id,
            errors: [],
            warnings: [],
          },
        },
      },
    });
    await prisma.listingImportAuditEvent.create({
      data: {
        actorUserId: user.id,
        organizationId: distributor.id,
        importId: imported.id,
        action: "import.commit",
      },
    });

    await expect(prisma.organization.delete({ where: { id: distributor.id } })).rejects.toThrow();
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow();
    await expect(prisma.distributorListing.delete({ where: { id: listing.id } })).rejects.toThrow();
    await prisma.listingImportRow.updateMany({
      where: { importId: imported.id },
      data: { existingListingId: null },
    });
    await prisma.distributorListing.delete({ where: { id: listing.id } });
    await expect(prisma.medicinePack.delete({ where: { id: pack.id } })).rejects.toThrow();
  });
});
