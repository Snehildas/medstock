import {
  ListingCurrency,
  ListingStatus,
  OrganizationType,
  PackUnit,
  StockStatus,
  createPrismaClient,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";
const prisma = createPrismaClient(databaseUrl);
const testRun = `listing-${Date.now()}`;

function name(label: string): string {
  return `${label} ${testRun}`;
}

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.listingAuditEvent.deleteMany({
    where: { listing: { medicinePack: { description: { contains: testRun } } } },
  });
  await prisma.distributorListing.deleteMany({
    where: { medicinePack: { description: { contains: testRun } } },
  });
  await prisma.medicinePack.deleteMany({ where: { description: { contains: testRun } } });
  await prisma.medicine.deleteMany({ where: { normalizedDisplayName: { contains: testRun } } });
  await prisma.organization.deleteMany({ where: { slug: { contains: testRun } } });
});

describe("distributor listings", () => {
  it("stores one decimal price per distributor and pack and keeps pack size separate", async () => {
    const organization = await prisma.organization.create({
      data: { name: name("Distributor"), slug: `dist-${testRun}`, type: OrganizationType.DISTRIBUTOR },
    });
    const medicine = await prisma.medicine.create({
      data: {
        displayName: name("Crocin"),
        normalizedDisplayName: name("crocin").toLowerCase(),
        genericName: name("Paracetamol"),
        dosageForm: "Tablet",
      },
    });
    const pack = await prisma.medicinePack.create({
      data: {
        medicineId: medicine.id,
        description: name("Strip of 10"),
        quantity: "10",
        unit: PackUnit.TABLET,
      },
    });
    const listing = await prisma.distributorListing.create({
      data: {
        organizationId: organization.id,
        medicinePackId: pack.id,
        unitPrice: "12.50",
        currency: ListingCurrency.INR,
        minimumOrderQuantity: "2",
        stockStatus: StockStatus.UNKNOWN,
        status: ListingStatus.ACTIVE,
      },
    });

    expect(listing.unitPrice.toString()).toBe("12.5");
    expect(listing.availableQuantity).toBeNull();
    expect(pack.quantity.toString()).toBe("10");
    await expect(
      prisma.distributorListing.create({
        data: {
          organizationId: organization.id,
          medicinePackId: pack.id,
          unitPrice: "9",
          minimumOrderQuantity: "1",
          stockStatus: StockStatus.IN_STOCK,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(prisma.medicinePack.delete({ where: { id: pack.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });
});
