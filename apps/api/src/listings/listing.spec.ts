import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import {
  CatalogStatus,
  ListingStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  PackUnit,
  UserStatus,
  createPrismaClient,
  normalizeEmail,
  type PrismaClient,
} from "@medstock/database";
import { retailerListingSchema } from "@medstock/shared-types";
import { DatabaseModule } from "../database/database.module.js";
import {
  DuplicateListingError,
  InvalidListingTransitionError,
  ListingForbiddenError,
  ListingNotFoundError,
  OrganizationNotDistributorError,
} from "../identity/domain-error.js";
import { IDENTITY_VERIFIER } from "../identity/identity-verifier.js";
import { IdentityService } from "../identity/identity.service.js";
import { LISTING_FRESH_WINDOW_MS } from "./freshness.js";
import { ListingModule } from "./listing.module.js";
import { ListingService } from "./listing.service.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";
const testRun = `listing-api-${Date.now()}`;
const ownerToken = "listing-owner-token-00001";

function email(label: string): string {
  return normalizeEmail(`${label}.${testRun}@example.test`);
}

function label(value: string): string {
  return `${value} ${testRun}`;
}

describe("listing service", () => {
  let prisma: PrismaClient;
  let listings: ListingService;
  let moduleRef: TestingModule;
  let ownerId: string;
  let staffId: string;
  let otherOwnerId: string;
  let retailerId: string;
  let adminId: string;
  let distributorId: string;
  let otherDistributorId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, ListingModule],
    }).compile();
    listings = moduleRef.get(ListingService);
    ownerId = await user("owner");
    staffId = await user("staff");
    otherOwnerId = await user("other-owner");
    retailerId = await user("retailer");
    adminId = await user("admin");
    distributorId = await organization("own", OrganizationType.DISTRIBUTOR);
    otherDistributorId = await organization("other", OrganizationType.DISTRIBUTOR);
    const retailerOrg = await organization("retail", OrganizationType.RETAILER);
    const platformOrg = await organization("platform", OrganizationType.PLATFORM);
    await membership(ownerId, distributorId, MembershipRole.DISTRIBUTOR_OWNER);
    await membership(staffId, distributorId, MembershipRole.DISTRIBUTOR_STAFF);
    await membership(otherOwnerId, otherDistributorId, MembershipRole.DISTRIBUTOR_OWNER);
    await membership(retailerId, retailerOrg, MembershipRole.RETAILER_OWNER);
    await membership(adminId, platformOrg, MembershipRole.PLATFORM_ADMIN);
  });

  afterAll(async () => {
    await moduleRef.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.listingAuditEvent.deleteMany({
      where: { organization: { slug: { contains: testRun } } },
    });
    await prisma.distributorListing.deleteMany({
      where: { organization: { slug: { contains: testRun } } },
    });
    await prisma.medicinePack.deleteMany({ where: { description: { contains: testRun } } });
    await prisma.medicine.deleteMany({ where: { normalizedDisplayName: { contains: testRun } } });
  });

  it("lets the owner and staff manage their own listing without copying pack size", async () => {
    const pack = await packFor(label("Visible"), true);
    const created = await listings.create(ownerId, distributorId, {
      medicinePackId: pack.id,
      unitPrice: "12.5",
      currency: "INR",
      minimumOrderQuantity: "3",
      stockStatus: "IN_STOCK",
      availableQuantity: null,
    });
    expect(created.availableQuantity).toBeNull();
    expect(created.medicinePack.quantity.toString()).toBe("10");
    expect(created.source).toBe("MANUAL");

    const priced = await listings.update(staffId, created.id, { unitPrice: "11" });
    expect(priced.priceUpdatedAt?.getTime()).not.toBe(created.priceUpdatedAt?.getTime());
    expect(priced.stockUpdatedAt?.getTime()).toBe(created.stockUpdatedAt?.getTime());

    const noted = await listings.update(staffId, created.id, { minimumOrderQuantity: "4" });
    expect(noted.priceUpdatedAt?.getTime()).toBe(priced.priceUpdatedAt?.getTime());
    expect(noted.stockUpdatedAt?.getTime()).toBe(priced.stockUpdatedAt?.getTime());

    await expect(
      listings.create(ownerId, distributorId, {
        medicinePackId: pack.id,
        unitPrice: "10",
        currency: "INR",
        minimumOrderQuantity: "1",
        stockStatus: "UNKNOWN",
      }),
    ).rejects.toBeInstanceOf(DuplicateListingError);
    await expect(
      listings.update(otherOwnerId, created.id, { unitPrice: "1" }),
    ).rejects.toBeInstanceOf(ListingForbiddenError);
    await expect(
      listings.create(retailerId, distributorId, {
        medicinePackId: pack.id,
        unitPrice: "10",
        currency: "INR",
        minimumOrderQuantity: "1",
        stockStatus: "UNKNOWN",
      }),
    ).rejects.toBeInstanceOf(ListingForbiddenError);
  });

  it("rejects a retailer organization and keeps price freshness independent of stock", async () => {
    const retailerOrg = await organization("shop", OrganizationType.RETAILER);
    await membership(retailerId, retailerOrg, MembershipRole.RETAILER_STAFF);
    const pack = await packFor(label("Retail pack"), true);
    await expect(
      listings.create(retailerId, retailerOrg, {
        medicinePackId: pack.id,
        unitPrice: "5",
        currency: "INR",
        minimumOrderQuantity: "1",
        stockStatus: "IN_STOCK",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotDistributorError);

    const listing = await listings.create(ownerId, distributorId, {
      medicinePackId: pack.id,
      unitPrice: "5",
      currency: "INR",
      minimumOrderQuantity: "1",
      stockStatus: "IN_STOCK",
      availableQuantity: "4",
    });
    await prisma.distributorListing.update({
      where: { id: listing.id },
      data: { stockUpdatedAt: new Date(Date.now() - LISTING_FRESH_WINDOW_MS - 1000) },
    });
    const stale = await listings.getForDistributor(ownerId, listing.id);
    const { freshnessFor } = await import("./listing.service.js");
    const freshness = freshnessFor(stale);
    expect(freshness.stockFreshness).toBe("STALE");
    expect(freshness.priceFreshness).toBe("FRESH");

    await prisma.distributorListing.update({
      where: { id: listing.id },
      data: { stockUpdatedAt: null },
    });
    const unknown = freshnessFor(await listings.getForDistributor(ownerId, listing.id));
    expect(unknown.stockFreshness).toBe("UNKNOWN");
    expect(unknown.priceFreshness).toBe("FRESH");
  });

  it("shows only discoverable listings and audits a platform suspension", async () => {
    const visiblePack = await packFor(label("Alpha"), true);
    const hiddenPack = await packFor(label("Hidden"), false);
    const visible = await listings.create(ownerId, distributorId, offer(visiblePack.id, "20"));
    const hidden = await listings.create(ownerId, distributorId, offer(hiddenPack.id, "8"));
    const paused = await listings.create(staffId, distributorId, offer((await packFor(label("Paused"), true)).id, "15"));
    await listings.pause(ownerId, paused.id);
    const second = await listings.create(otherOwnerId, otherDistributorId, offer(visiblePack.id, "18"));

    const page = await listings.searchForRetailer(retailerId, {
      q: testRun,
      page: 1,
      pageSize: 1,
    });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(second.id);
    const next = await listings.searchForRetailer(retailerId, { q: testRun, page: 2, pageSize: 1 });
    expect(next.items[0]?.id).toBe(visible.id);
    expect(page.items.map((item) => item.id)).not.toContain(hidden.id);
    expect(page.items.map((item) => item.id)).not.toContain(paused.id);

    const filtered = await listings.searchForRetailer(retailerId, {
      q: "",
      medicinePackId: visiblePack.id,
      minPrice: "19",
      maxPrice: "21",
      stockStatus: "UNKNOWN",
      page: 1,
      pageSize: 10,
    });
    expect(filtered.items.map((item) => item.id)).toEqual([visible.id]);

    await expect(listings.update(adminId, visible.id, { unitPrice: "1" })).rejects.toBeInstanceOf(
      ListingForbiddenError,
    );
    const suspended = await listings.suspend(adminId, visible.id);
    expect(suspended.status).toBe(ListingStatus.SUSPENDED);
    const audit = await prisma.listingAuditEvent.findFirst({
      where: { listingId: visible.id, action: "listing.suspend" },
    });
    expect(audit?.actorUserId).toBe(adminId);
    await expect(listings.pause(ownerId, visible.id)).rejects.toBeInstanceOf(
      InvalidListingTransitionError,
    );
    await expect(listings.getForRetailer(retailerId, visible.id)).rejects.toBeInstanceOf(
      ListingNotFoundError,
    );
  });

  function offer(medicinePackId: string, unitPrice: string) {
    return {
      medicinePackId,
      unitPrice,
      currency: "INR" as const,
      minimumOrderQuantity: "1",
      stockStatus: "UNKNOWN" as const,
    };
  }

  async function packFor(displayName: string, visible: boolean) {
    const medicine = await prisma.medicine.create({
      data: {
        displayName,
        normalizedDisplayName: displayName.toLowerCase(),
        genericName: displayName,
        dosageForm: "Tablet",
        status: visible ? CatalogStatus.PUBLISHED : CatalogStatus.DRAFT,
        searchVisible: visible,
        searchText: displayName.toLowerCase(),
      },
    });
    return prisma.medicinePack.create({
      data: {
        medicineId: medicine.id,
        description: `${displayName} pack`,
        quantity: "10",
        unit: PackUnit.TABLET,
      },
    });
  }

  async function user(name: string): Promise<string> {
    const row = await prisma.user.create({
      data: { email: email(name), status: UserStatus.ACTIVE },
    });
    return row.id;
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

  async function membership(userId: string, organizationId: string, role: MembershipRole) {
    await prisma.organizationMembership.create({
      data: { userId, organizationId, role, status: MembershipStatus.ACTIVE },
    });
  }
});

describe("listing HTTP boundary", () => {
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
      where: { actor: { email: { contains: testRun } } },
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
    await prisma.user.deleteMany({ where: { email: { contains: testRun } } });
    await prisma.organization.deleteMany({ where: { slug: { contains: testRun } } });
  });

  it("rejects a role in the body and returns the canonical pack", async () => {
    const app = await httpApp();
    try {
      const identity = app.get(IdentityService);
      const owner = await identity.provision({
        subject: "listing-owner",
        email: email("http-owner"),
        emailVerified: true,
        displayName: "Owner",
      });
      const retailer = await identity.provision({
        subject: "listing-retailer",
        email: email("http-retailer"),
        emailVerified: true,
        displayName: "Retailer",
      });
      const distributor = await prisma.organization.create({
        data: {
          name: label("HTTP Dist"),
          slug: `http-dist-${testRun}`,
          type: OrganizationType.DISTRIBUTOR,
          status: OrganizationStatus.ACTIVE,
        },
      });
      const shop = await prisma.organization.create({
        data: {
          name: label("HTTP Shop"),
          slug: `http-shop-${testRun}`,
          type: OrganizationType.RETAILER,
          status: OrganizationStatus.ACTIVE,
        },
      });
      await prisma.organizationMembership.createMany({
        data: [
          {
            userId: owner.id,
            organizationId: distributor.id,
            role: MembershipRole.DISTRIBUTOR_OWNER,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: retailer.id,
            organizationId: shop.id,
            role: MembershipRole.RETAILER_STAFF,
            status: MembershipStatus.ACTIVE,
          },
        ],
      });
      const medicine = await prisma.medicine.create({
        data: {
          displayName: label("HTTP Medicine"),
          normalizedDisplayName: label("http medicine").toLowerCase(),
          genericName: label("HTTP Generic"),
          dosageForm: "Tablet",
          status: CatalogStatus.PUBLISHED,
          searchVisible: true,
          searchText: label("http medicine").toLowerCase(),
        },
      });
      const pack = await prisma.medicinePack.create({
        data: {
          medicineId: medicine.id,
          description: label("HTTP pack"),
          quantity: "10",
          unit: PackUnit.TABLET,
        },
      });

      const rejected = await request(app.getHttpServer())
        .post("/distributor/listings")
        .query({ organizationId: distributor.id })
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          medicinePackId: pack.id,
          unitPrice: "9",
          minimumOrderQuantity: "1",
          role: "DISTRIBUTOR_OWNER",
          priceUpdatedAt: new Date().toISOString(),
        });
      expect(rejected.status).toBe(400);
      expect(JSON.stringify(rejected.body)).toContain("role");

      const created = await request(app.getHttpServer())
        .post("/distributor/listings")
        .query({ organizationId: distributor.id })
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ medicinePackId: pack.id, unitPrice: "9", minimumOrderQuantity: "1" })
        .expect(201);
      expect(created.body.availableQuantity).toBeNull();
      expect(created.body.pack.quantity).toBe("10");
      expect(created.body.priceIsIndicative).toBe(true);
      expect(created.body.medicine.displayName).toBe(label("HTTP Medicine"));

      const found = await request(app.getHttpServer())
        .get("/listings")
        .query({ medicinePackId: pack.id })
        .set("Authorization", "Bearer listing-retailer-token1")
        .expect(200);
      const page = found.body as { items: unknown[] };
      expect(page.items).toHaveLength(1);
      expect(retailerListingSchema.parse(page.items[0]).distributor.name).toBe(label("HTTP Dist"));
      expect(JSON.stringify(page.items[0])).not.toContain("sourceNote");
    } finally {
      await app.close();
    }
  });

  async function httpApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [ListingModule] })
      .overrideProvider(IDENTITY_VERIFIER)
      .useValue({
        verify: async (token: string) => {
          if (token === ownerToken) {
            return {
              subject: "listing-owner",
              email: email("http-owner"),
              emailVerified: true,
              displayName: "Owner",
            };
          }
          if (token === "listing-retailer-token1") {
            return {
              subject: "listing-retailer",
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
