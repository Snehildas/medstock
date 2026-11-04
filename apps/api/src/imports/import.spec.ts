import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import ExcelJS from "exceljs";
import request from "supertest";
import {
  CatalogStatus,
  ListingCurrency,
  ListingSource,
  ListingStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  PackUnit,
  StockStatus,
  UserStatus,
  createPrismaClient,
  normalizeEmail,
  type PrismaClient,
} from "@medstock/database";
import { listingImportPageSchema, listingImportSchema } from "@medstock/shared-types";
import { DatabaseModule } from "../database/database.module.js";
import {
  ImportFileRejectedError,
  ImportForbiddenError,
  ImportNotFoundError,
  InvalidImportTransitionError,
  OrganizationIneligibleError,
  OrganizationNotDistributorError,
} from "../identity/domain-error.js";
import { IDENTITY_VERIFIER } from "../identity/identity-verifier.js";
import { IdentityService } from "../identity/identity.service.js";
import { IMPORT_MAX_BYTES } from "./import-limits.js";
import { ImportModule } from "./import.module.js";
import { ImportService } from "./import.service.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";
const testRun = `import-api-${Date.now()}`;
const distributorToken = "import-distributor-token";
const retailerToken = "import-retailer-token";
const headers = [
  "medicine_name",
  "pack_id",
  "pack_description",
  "indicative_unit_price",
  "currency",
  "minimum_order_quantity",
  "stock_status",
  "available_quantity",
  "source_note",
];

function email(label: string): string {
  return normalizeEmail(`${label}.${testRun}@example.test`);
}

function csv(lines: string[]): Buffer {
  return Buffer.from([headers.join(","), ...lines].join("\n"), "utf8");
}

function row(values: Partial<Record<(typeof headers)[number], string>>): string {
  return headers.map((header) => values[header] ?? "").join(",");
}

describe("listing import service", () => {
  let prisma: PrismaClient;
  let moduleRef: TestingModule;
  let imports: ImportService;
  let ownerId: string;
  let staffId: string;
  let retailerId: string;
  let otherOwnerId: string;
  let adminId: string;
  let distributorOrgId: string;
  let otherDistributorOrgId: string;
  let retailerOrgId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, ImportModule],
    }).compile();
    imports = moduleRef.get(ImportService);
    ownerId = await user("owner");
    staffId = await user("staff");
    retailerId = await user("retailer");
    otherOwnerId = await user("other-owner");
    adminId = await user("admin");
    distributorOrgId = await organization("dist", OrganizationType.DISTRIBUTOR);
    otherDistributorOrgId = await organization("other-dist", OrganizationType.DISTRIBUTOR);
    retailerOrgId = await organization("shop", OrganizationType.RETAILER);
    const platformId = await organization("platform", OrganizationType.PLATFORM);
    await membership(ownerId, distributorOrgId, MembershipRole.DISTRIBUTOR_OWNER);
    await membership(staffId, distributorOrgId, MembershipRole.DISTRIBUTOR_STAFF);
    await membership(retailerId, retailerOrgId, MembershipRole.RETAILER_OWNER);
    await membership(otherOwnerId, otherDistributorOrgId, MembershipRole.DISTRIBUTOR_OWNER);
    await membership(adminId, platformId, MembershipRole.PLATFORM_ADMIN);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma?.$disconnect();
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
  });

  it("previews a CSV without changing listings", async () => {
    const { packs } = await medicineWithPacks("Visible", ["Strip"]);
    const pack = packs[0];
    if (!pack) {
      throw new Error("missing pack");
    }
    const before = await prisma.distributorListing.count();
    const preview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "listings.csv",
      bytes: csv([
        row({
          pack_id: pack.id,
          indicative_unit_price: "12.50",
          currency: "INR",
          minimum_order_quantity: "2",
          stock_status: "IN_STOCK",
          available_quantity: "8",
          source_note: "counter",
        }),
      ]),
    });
    expect(preview.status).toBe("PREVIEW_READY");
    expect(preview.validRows).toBe(1);
    expect(preview.rows[0]?.action).toBe("CREATE");
    expect(preview.rows[0]?.matchedPackId).toBe(pack.id);
    expect(await prisma.distributorListing.count()).toBe(before);
    expect(await prisma.listingAuditEvent.count({ where: { organizationId: distributorOrgId } })).toBe(0);
    expect(await prisma.listingImportAuditEvent.count({ where: { importId: preview.id } })).toBe(0);

    const again = await imports.createPreview(staffId, distributorOrgId, {
      fileName: "listings.csv",
      bytes: csv([
        row({
          pack_id: pack.id,
          indicative_unit_price: "12.50",
          currency: "INR",
          minimum_order_quantity: "2",
          stock_status: "IN_STOCK",
          available_quantity: "8",
          source_note: "counter",
        }),
      ]),
    });
    expect(again.id).toBe(preview.id);
    const loaded = await imports.get(ownerId, preview.id);
    expect(loaded.totalRows).toBe(1);
  });

  it("previews an XLSX file without changing listings", async () => {
    const { packs } = await medicineWithPacks("Sheet", ["Box"]);
    const pack = packs[0];
    if (!pack) {
      throw new Error("missing pack");
    }
    const before = await prisma.distributorListing.count();
    const preview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "listings.xlsx",
      bytes: await workbook([
        row({
          medicine_name: "Wrong name",
          pack_id: pack.id,
          pack_description: "Not the pack",
          indicative_unit_price: "4",
          currency: "inr",
          minimum_order_quantity: "1",
          stock_status: "UNKNOWN",
        }),
      ]),
    });
    expect(preview.validRows).toBe(1);
    expect(preview.rows[0]?.warnings.length).toBeGreaterThan(0);
    expect(await prisma.distributorListing.count()).toBe(before);
  });

  it("rejects unsupported, malformed, oversized, and over-limit files before creating an import", async () => {
    const before = await prisma.listingImport.count();
    await expect(
      imports.createPreview(ownerId, distributorOrgId, {
        fileName: "listings.txt",
        bytes: Buffer.from("indicative_unit_price\n1\n"),
      }),
    ).rejects.toBeInstanceOf(ImportFileRejectedError);
    await expect(
      imports.createPreview(ownerId, distributorOrgId, {
        fileName: "listings.csv",
        bytes: Buffer.from("price\0value"),
      }),
    ).rejects.toBeInstanceOf(ImportFileRejectedError);
    await expect(
      imports.createPreview(ownerId, distributorOrgId, {
        fileName: "listings.xlsx",
        bytes: Buffer.from("not a workbook"),
      }),
    ).rejects.toBeInstanceOf(ImportFileRejectedError);
    await expect(
      imports.createPreview(ownerId, distributorOrgId, {
        fileName: "listings.csv",
        bytes: Buffer.alloc(IMPORT_MAX_BYTES + 1, 65),
      }),
    ).rejects.toBeInstanceOf(ImportFileRejectedError);
    const lines = Array.from({ length: 501 }, () =>
      row({
        indicative_unit_price: "1",
        currency: "INR",
        minimum_order_quantity: "1",
        stock_status: "UNKNOWN",
      }),
    );
    await expect(
      imports.createPreview(ownerId, distributorOrgId, {
        fileName: "listings.csv",
        bytes: csv(lines),
      }),
    ).rejects.toBeInstanceOf(ImportFileRejectedError);
    await expect(
      imports.createPreview(ownerId, distributorOrgId, {
        fileName: "listings.csv",
        bytes: Buffer.from("medicine_name\nName\n"),
      }),
    ).rejects.toBeInstanceOf(ImportFileRejectedError);
    expect(await prisma.listingImport.count()).toBe(before);
  });

  it("reports invalid values, unmatched packs, ambiguous packs, and in-file duplicates", async () => {
    const first = await medicineWithPacks("Alpha", ["Shared", "Other"]);
    const second = await medicineWithPacks("Beta", ["Shared"]);
    const hidden = await medicineWithPacks("Hidden", ["Secret"], false);
    const alpha = first.packs[0];
    const hiddenPack = hidden.packs[0];
    const shared = second.packs[0];
    if (!alpha || !hiddenPack || !shared) {
      throw new Error("missing pack");
    }
    const preview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "listings.csv",
      bytes: csv([
        row({
          pack_id: alpha.id,
          indicative_unit_price: "-1",
          currency: "USD",
          minimum_order_quantity: "0",
          stock_status: "PLENTY",
          available_quantity: "-3",
        }),
        row({
          pack_id: "00000000-0000-4000-8000-000000000000",
          indicative_unit_price: "1",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
        }),
        row({
          pack_description: `Shared ${testRun}`,
          indicative_unit_price: "1",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
        }),
        row({
          medicine_name: `Alpha ${testRun}`,
          indicative_unit_price: "1",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
        }),
        row({
          pack_id: hiddenPack.id,
          indicative_unit_price: "1",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
        }),
        row({
          pack_id: shared.id,
          indicative_unit_price: "3",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
        }),
        row({
          pack_id: shared.id,
          indicative_unit_price: "4",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "LOW_STOCK",
        }),
        row({
          medicine_name: "=1+1",
          pack_description: `Shared ${testRun}`,
          indicative_unit_price: "5",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "OUT_OF_STOCK",
        }),
      ]),
    });
    expect(preview.invalidRows).toBe(preview.totalRows);
    expect(preview.rows[0]?.errors.join(" ")).toContain("indicative_unit_price");
    expect(preview.rows[1]?.errors.join(" ")).toContain("pack_id");
    expect(preview.rows[2]?.errors.join(" ")).toContain("More than one");
    expect(preview.rows[3]?.errors.join(" ")).toContain("More than one");
    expect(preview.rows[4]?.errors.join(" ")).toContain("not eligible");
    expect(preview.rows[5]?.errors.join(" ")).toContain("more than once");
    expect(preview.rows[6]?.errors.join(" ")).toContain("more than once");
    expect(preview.rows[7]?.medicineName?.startsWith("'")).toBe(true);
    const committed = await imports.commit(ownerId, preview.id);
    expect(committed.status).toBe("COMMITTED");
    expect(committed.createdRows).toBe(0);
    expect(await prisma.distributorListing.count({ where: { organizationId: distributorOrgId } })).toBe(0);
    expect(
      await prisma.listingImportAuditEvent.count({
        where: { importId: preview.id, action: "import.commit" },
      }),
    ).toBe(1);
  });

  it("matches one pack from a medicine name and keeps the preview inside the distributor organization", async () => {
    const { packs } = await medicineWithPacks("Only", ["Single"]);
    const pack = packs[0];
    if (!pack) {
      throw new Error("missing pack");
    }
    const preview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "listings.csv",
      bytes: csv([
        row({
          medicine_name: `Only ${testRun}`,
          indicative_unit_price: "9",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "UNKNOWN",
        }),
      ]),
    });
    expect(preview.rows[0]?.matchedPackId).toBe(pack.id);
    expect(preview.rows[0]?.action).toBe("CREATE");
    await expect(imports.get(otherOwnerId, preview.id)).rejects.toBeInstanceOf(ImportNotFoundError);
    await expect(imports.commit(otherOwnerId, preview.id)).rejects.toBeInstanceOf(ImportNotFoundError);
    await expect(imports.get(retailerId, preview.id)).rejects.toBeInstanceOf(ImportNotFoundError);
    await expect(
      imports.createPreview(retailerId, retailerOrgId, {
        fileName: "listings.csv",
        bytes: csv([row({ indicative_unit_price: "1", currency: "INR", minimum_order_quantity: "1", stock_status: "UNKNOWN" })]),
      }),
    ).rejects.toBeInstanceOf(OrganizationNotDistributorError);
    await expect(
      imports.createPreview(retailerId, distributorOrgId, {
        fileName: "listings.csv",
        bytes: csv([row({ indicative_unit_price: "1", currency: "INR", minimum_order_quantity: "1", stock_status: "UNKNOWN" })]),
      }),
    ).rejects.toBeInstanceOf(ImportForbiddenError);
  });

  it("creates and updates eligible listings, skips invalid rows, and ignores a repeated commit", async () => {
    const createdPack = (await medicineWithPacks("Create", ["Create pack"])).packs[0];
    const updatedPack = (await medicineWithPacks("Update", ["Update pack"])).packs[0];
    const invalidPack = (await medicineWithPacks("Invalid", ["Invalid pack"])).packs[0];
    if (!createdPack || !updatedPack || !invalidPack) {
      throw new Error("missing pack");
    }
    const past = new Date("2020-01-01T00:00:00.000Z");
    const existing = await prisma.distributorListing.create({
      data: {
        organizationId: distributorOrgId,
        medicinePackId: updatedPack.id,
        unitPrice: "10.00",
        currency: ListingCurrency.INR,
        minimumOrderQuantity: "1",
        stockStatus: StockStatus.IN_STOCK,
        availableQuantity: "5",
        sourceNote: "old",
        source: ListingSource.MANUAL,
        priceUpdatedAt: past,
        stockUpdatedAt: past,
      },
    });
    const preview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "listings.csv",
      bytes: csv([
        row({
          pack_id: createdPack.id,
          indicative_unit_price: "15",
          currency: "INR",
          minimum_order_quantity: "2",
          stock_status: "IN_STOCK",
          available_quantity: "4",
          source_note: "new",
        }),
        row({
          pack_id: updatedPack.id,
          indicative_unit_price: "20",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
        }),
        row({
          pack_id: invalidPack.id,
          indicative_unit_price: "nope",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
        }),
      ]),
    });
    expect(preview.rows.map((item) => item.action)).toEqual(["CREATE", "UPDATE", null]);
    const committed = await imports.commit(ownerId, preview.id);
    expect(committed.createdRows).toBe(1);
    expect(committed.updatedRows).toBe(1);
    expect(committed.skippedRows).toBe(1);
    const created = await prisma.distributorListing.findUniqueOrThrow({
      where: {
        organizationId_medicinePackId: {
          organizationId: distributorOrgId,
          medicinePackId: createdPack.id,
        },
      },
    });
    expect(created.source).toBe(ListingSource.CSV_IMPORT);
    expect(created.unitPrice.toString()).toBe("15");
    expect(created.priceUpdatedAt).not.toBeNull();
    expect(created.stockUpdatedAt).not.toBeNull();
    const updated = await prisma.distributorListing.findUniqueOrThrow({ where: { id: existing.id } });
    expect(updated.unitPrice.toString()).toBe("20");
    expect(updated.stockUpdatedAt?.toISOString()).toBe(past.toISOString());
    expect(updated.priceUpdatedAt?.getTime()).toBeGreaterThan(past.getTime());
    expect(updated.availableQuantity?.toString()).toBe("5");
    expect(await prisma.distributorListing.count({ where: { medicinePackId: invalidPack.id } })).toBe(0);
    expect(
      await prisma.listingAuditEvent.count({
        where: { listingId: created.id, action: "listing.import_create", importId: preview.id },
      }),
    ).toBe(1);
    expect(
      await prisma.listingAuditEvent.count({
        where: { listingId: existing.id, action: "listing.import_update", importId: preview.id },
      }),
    ).toBe(1);

    const repeated = await imports.commit(ownerId, preview.id);
    expect(repeated.createdRows).toBe(1);
    expect(await prisma.distributorListing.count({ where: { organizationId: distributorOrgId } })).toBe(2);
    expect(
      await prisma.listingImportAuditEvent.count({ where: { importId: preview.id, action: "import.commit" } }),
    ).toBe(1);
    expect(await prisma.listingAuditEvent.count({ where: { importId: preview.id } })).toBe(2);
  });

  it("refreshes stock freshness independently and leaves both timestamps unchanged for MOQ and notes", async () => {
    const pack = (await medicineWithPacks("Fresh", ["Fresh pack"])).packs[0];
    if (!pack) {
      throw new Error("missing pack");
    }
    const past = new Date("2020-01-01T00:00:00.000Z");
    const listing = await prisma.distributorListing.create({
      data: {
        organizationId: distributorOrgId,
        medicinePackId: pack.id,
        unitPrice: "10",
        currency: ListingCurrency.INR,
        minimumOrderQuantity: "1",
        stockStatus: StockStatus.IN_STOCK,
        availableQuantity: "5",
        sourceNote: "old",
        priceUpdatedAt: past,
        stockUpdatedAt: past,
      },
    });
    const stockPreview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "stock.csv",
      bytes: csv([
        row({
          pack_id: pack.id,
          indicative_unit_price: "10",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "LOW_STOCK",
          available_quantity: "1",
        }),
      ]),
    });
    await imports.commit(ownerId, stockPreview.id);
    const afterStock = await prisma.distributorListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(afterStock.priceUpdatedAt?.toISOString()).toBe(past.toISOString());
    expect(afterStock.stockUpdatedAt?.getTime()).toBeGreaterThan(past.getTime());
    const stockUpdatedAt = afterStock.stockUpdatedAt;

    const notePreview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "note.csv",
      bytes: csv([
        row({
          pack_id: pack.id,
          indicative_unit_price: "10",
          currency: "INR",
          minimum_order_quantity: "6",
          stock_status: "LOW_STOCK",
          available_quantity: "1",
          source_note: "invoice 12",
        }),
      ]),
    });
    await imports.commit(ownerId, notePreview.id);
    const afterNote = await prisma.distributorListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(afterNote.minimumOrderQuantity.toString()).toBe("6");
    expect(afterNote.sourceNote).toBe("invoice 12");
    expect(afterNote.priceUpdatedAt?.toISOString()).toBe(past.toISOString());
    expect(afterNote.stockUpdatedAt?.toISOString()).toBe(stockUpdatedAt?.toISOString());
    expect(
      await prisma.listingAuditEvent.count({
        where: { listingId: listing.id, action: "listing.import_update" },
      }),
    ).toBe(2);
  });

  it("does not reactivate paused, archived, or suspended listings", async () => {
    const packs = await Promise.all(
      [ListingStatus.PAUSED, ListingStatus.ARCHIVED, ListingStatus.SUSPENDED].map(async (status) => {
        const pack = (await medicineWithPacks(status, [`${status} pack`])).packs[0];
        if (!pack) {
          throw new Error("missing pack");
        }
        await prisma.distributorListing.create({
          data: {
            organizationId: distributorOrgId,
            medicinePackId: pack.id,
            status,
            unitPrice: "7",
            currency: ListingCurrency.INR,
            minimumOrderQuantity: "1",
            stockStatus: StockStatus.UNKNOWN,
          },
        });
        return pack;
      }),
    );
    const preview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "inactive.csv",
      bytes: csv(
        packs.map((pack) =>
          row({
            pack_id: pack.id,
            indicative_unit_price: "99",
            currency: "INR",
            minimum_order_quantity: "3",
            stock_status: "IN_STOCK",
          }),
        ),
      ),
    });
    expect(preview.validRows).toBe(0);
    await imports.commit(ownerId, preview.id);
    const listings = await prisma.distributorListing.findMany({
      where: { organizationId: distributorOrgId },
      orderBy: { status: "asc" },
    });
    expect(listings.map((listing) => listing.status).sort()).toEqual([
      ListingStatus.ARCHIVED,
      ListingStatus.PAUSED,
      ListingStatus.SUSPENDED,
    ]);
    expect(listings.every((listing) => listing.unitPrice.toString() === "7")).toBe(true);
    expect(await prisma.listingAuditEvent.count({ where: { organizationId: distributorOrgId } })).toBe(0);
  });

  it("lets only one of two concurrent commits create a listing and its audit", async () => {
    const pack = (await medicineWithPacks("Race", ["Race pack"])).packs[0];
    if (!pack) {
      throw new Error("missing pack");
    }
    const first = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "race-a.csv",
      bytes: csv([
        row({
          pack_id: pack.id,
          indicative_unit_price: "10",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
        }),
      ]),
    });
    const second = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "race-b.csv",
      bytes: csv([
        row({
          pack_id: pack.id,
          indicative_unit_price: "11",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
        }),
      ]),
    });
    await Promise.all([imports.commit(ownerId, first.id), imports.commit(ownerId, second.id)]);
    expect(
      await prisma.distributorListing.count({
        where: { organizationId: distributorOrgId, medicinePackId: pack.id },
      }),
    ).toBe(1);
    expect(
      await prisma.listingAuditEvent.count({
        where: { organizationId: distributorOrgId, action: "listing.import_create" },
      }),
    ).toBe(1);
    const sameFile = await imports.commit(ownerId, first.id);
    expect(sameFile.status).toBe("COMMITTED");
    expect(
      await prisma.listingImportAuditEvent.count({
        where: { importId: first.id, action: "import.commit" },
      }),
    ).toBe(1);
  });

  it("cancels a preview and records one cancel audit", async () => {
    const pack = (await medicineWithPacks("Cancel", ["Cancel pack"])).packs[0];
    if (!pack) {
      throw new Error("missing pack");
    }
    const preview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "cancel.csv",
      bytes: csv([
        row({
          pack_id: pack.id,
          indicative_unit_price: "1",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "UNKNOWN",
        }),
      ]),
    });
    const cancelled = await imports.cancel(ownerId, preview.id);
    expect(cancelled.status).toBe("CANCELLED");
    await expect(imports.commit(ownerId, preview.id)).rejects.toBeInstanceOf(InvalidImportTransitionError);
    await expect(imports.cancel(ownerId, preview.id)).rejects.toBeInstanceOf(InvalidImportTransitionError);
    expect(
      await prisma.listingImportAuditEvent.count({ where: { importId: preview.id, action: "import.cancel" } }),
    ).toBe(1);
    expect(await prisma.distributorListing.count({ where: { medicinePackId: pack.id } })).toBe(0);
  });

  it("rejects a suspended distributor and lets a platform admin read the preview", async () => {
    const pack = (await medicineWithPacks("Admin", ["Admin pack"])).packs[0];
    if (!pack) {
      throw new Error("missing pack");
    }
    const preview = await imports.createPreview(ownerId, distributorOrgId, {
      fileName: "admin.csv",
      bytes: csv([
        row({
          pack_id: pack.id,
          indicative_unit_price: "1",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "UNKNOWN",
        }),
      ]),
    });
    await prisma.organization.update({
      where: { id: distributorOrgId },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    try {
      await expect(imports.get(ownerId, preview.id)).rejects.toBeInstanceOf(OrganizationIneligibleError);
      await expect(imports.commit(adminId, preview.id)).rejects.toBeInstanceOf(ImportNotFoundError);
      const read = await imports.getForAdmin(adminId, preview.id);
      expect(read.id).toBe(preview.id);
      await expect(imports.getForAdmin(ownerId, preview.id)).rejects.toBeInstanceOf(ImportForbiddenError);
    } finally {
      await prisma.organization.update({
        where: { id: distributorOrgId },
        data: { status: OrganizationStatus.ACTIVE },
      });
    }
  });

  async function user(label: string): Promise<string> {
    const created = await prisma.user.create({
      data: { email: email(label), status: UserStatus.ACTIVE },
    });
    return created.id;
  }

  async function organization(label: string, type: OrganizationType): Promise<string> {
    const created = await prisma.organization.create({
      data: {
        name: `${label} ${testRun}`,
        slug: `${label}-${testRun}`,
        type,
        status: OrganizationStatus.ACTIVE,
      },
    });
    return created.id;
  }

  async function membership(userId: string, organizationId: string, role: MembershipRole): Promise<void> {
    await prisma.organizationMembership.create({
      data: { userId, organizationId, role, status: MembershipStatus.ACTIVE },
    });
  }

  async function medicineWithPacks(
    name: string,
    descriptions: string[],
    published = true,
  ): Promise<{ packs: Array<{ id: string }> }> {
    const displayName = `${name} ${testRun}`;
    const medicine = await prisma.medicine.create({
      data: {
        displayName,
        normalizedDisplayName: displayName.toLowerCase(),
        genericName: "Generic",
        dosageForm: "Tablet",
        status: published ? CatalogStatus.PUBLISHED : CatalogStatus.DRAFT,
        searchVisible: published,
      },
    });
    const packs = [];
    for (const description of descriptions) {
      packs.push(
        await prisma.medicinePack.create({
          data: {
            medicineId: medicine.id,
            description: `${description} ${testRun}`,
            quantity: "10",
            unit: PackUnit.TABLET,
          },
        }),
      );
    }
    return { packs };
  }

  async function workbook(lines: string[]): Promise<Buffer> {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Listings");
    sheet.addRow(headers);
    for (const line of lines) {
      sheet.addRow(line.split(","));
    }
    const contents = await book.xlsx.writeBuffer();
    return Buffer.from(contents);
  }
});

describe("listing import HTTP", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
  });

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
    await prisma.organizationMembership.deleteMany({
      where: { user: { email: { contains: testRun } } },
    });
    await prisma.identityAccount.deleteMany({ where: { user: { email: { contains: testRun } } } });
    await prisma.user.deleteMany({
      where: { email: { contains: testRun }, NOT: { email: { contains: "owner." } } },
    });
    await prisma.organization.deleteMany({ where: { slug: { startsWith: "http-" } } });
  });

  it("requires an explicit commit and hides another organization's import", async () => {
    const app = await httpApp();
    try {
      const identity = app.get(IdentityService);
      const distributor = await identity.provision({
        subject: "import-distributor",
        email: email("http-distributor"),
        emailVerified: true,
        displayName: "Distributor",
      });
      const retailer = await identity.provision({
        subject: "import-retailer",
        email: email("http-retailer"),
        emailVerified: true,
        displayName: "Retailer",
      });
      const organization = await prisma.organization.create({
        data: {
          name: `HTTP Dist ${testRun}`,
          slug: `http-dist-${testRun}`,
          type: OrganizationType.DISTRIBUTOR,
          status: OrganizationStatus.ACTIVE,
        },
      });
      const shop = await prisma.organization.create({
        data: {
          name: `HTTP Shop ${testRun}`,
          slug: `http-shop-${testRun}`,
          type: OrganizationType.RETAILER,
          status: OrganizationStatus.ACTIVE,
        },
      });
      await prisma.organizationMembership.create({
        data: {
          userId: distributor.id,
          organizationId: organization.id,
          role: MembershipRole.DISTRIBUTOR_OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });
      await prisma.organizationMembership.create({
        data: {
          userId: retailer.id,
          organizationId: shop.id,
          role: MembershipRole.RETAILER_OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });
      const displayName = `HTTP Medicine ${testRun}`;
      const medicine = await prisma.medicine.create({
        data: {
          displayName,
          normalizedDisplayName: displayName.toLowerCase(),
          genericName: "Generic",
          dosageForm: "Tablet",
          status: CatalogStatus.PUBLISHED,
          searchVisible: true,
        },
      });
      const pack = await prisma.medicinePack.create({
        data: {
          medicineId: medicine.id,
          description: `HTTP pack ${testRun}`,
          quantity: "10",
          unit: PackUnit.TABLET,
        },
      });
      const file = csv([
        row({
          pack_id: pack.id,
          indicative_unit_price: "6.5",
          currency: "INR",
          minimum_order_quantity: "1",
          stock_status: "IN_STOCK",
          userId: distributor.id,
        } as Partial<Record<(typeof headers)[number], string>>),
      ]);
      const before = await prisma.distributorListing.count({ where: { organizationId: organization.id } });
      const rejected = await request(app.getHttpServer())
        .post("/distributor/imports")
        .query({ organizationId: organization.id, userId: distributor.id })
        .set("Authorization", `Bearer ${retailerToken}`)
        .attach("file", file, "listings.csv");
      expect(rejected.status).toBe(403);

      const uploaded = await request(app.getHttpServer())
        .post("/distributor/imports")
        .query({ organizationId: organization.id })
        .set("Authorization", `Bearer ${distributorToken}`)
        .attach("file", file, "listings.csv")
        .expect(201);
      const preview = listingImportSchema.parse(uploaded.body);
      expect(preview.status).toBe("PREVIEW_READY");
      expect(await prisma.distributorListing.count({ where: { organizationId: organization.id } })).toBe(before);

      const history = await request(app.getHttpServer())
        .get("/distributor/imports")
        .query({ organizationId: organization.id })
        .set("Authorization", `Bearer ${distributorToken}`)
        .expect(200);
      const page = listingImportPageSchema.parse(history.body);
      expect(page.items.map((item) => item.id)).toContain(preview.id);
      expect(JSON.stringify(history.body)).not.toContain("checksum");
      expect(JSON.stringify(history.body)).not.toContain(preview.checksum);
      await request(app.getHttpServer())
        .get("/distributor/imports")
        .query({ organizationId: organization.id })
        .set("Authorization", `Bearer ${retailerToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/distributor/imports/${preview.id}`)
        .set("Authorization", `Bearer ${retailerToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get("/distributor/imports/00000000-0000-4000-8000-000000000000")
        .set("Authorization", `Bearer ${distributorToken}`)
        .expect(404);

      const committed = await request(app.getHttpServer())
        .post(`/distributor/imports/${preview.id}/commit`)
        .set("Authorization", `Bearer ${distributorToken}`)
        .expect(201);
      expect(listingImportSchema.parse(committed.body).createdRows).toBe(1);
      const listing = await prisma.distributorListing.findFirstOrThrow({
        where: { organizationId: organization.id, medicinePackId: pack.id },
      });
      expect(listing.unitPrice.toString()).toBe("6.5");

      const oversized = await request(app.getHttpServer())
        .post("/distributor/imports")
        .query({ organizationId: organization.id })
        .set("Authorization", `Bearer ${distributorToken}`)
        .attach("file", Buffer.alloc(IMPORT_MAX_BYTES + 1, 65), "big.csv");
      expect(oversized.status).toBe(413);
      expect(JSON.stringify(oversized.body)).not.toContain("Prisma");
    } finally {
      await app.close();
    }
  });

  async function httpApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [ImportModule] })
      .overrideProvider(IDENTITY_VERIFIER)
      .useValue({
        verify: async (token: string) => {
          if (token === distributorToken) {
            return {
              subject: "import-distributor",
              email: email("http-distributor"),
              emailVerified: true,
              displayName: "Distributor",
            };
          }
          if (token === retailerToken) {
            return {
              subject: "import-retailer",
              email: email("http-retailer"),
              emailVerified: true,
              displayName: "Retailer",
            };
          }
          throw new Error("unexpected token");
        },
      })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }
});
