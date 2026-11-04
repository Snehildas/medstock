import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import {
  CatalogStatus,
  ListingCurrency,
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
import { DatabaseModule } from "../database/database.module.js";
import {
  EnquiryForbiddenError,
  EnquiryTargetUnavailableError,
  InvalidEnquiryTransitionError,
  SelfEnquiryError,
} from "../identity/domain-error.js";
import { IDENTITY_VERIFIER } from "../identity/identity-verifier.js";
import { IdentityService } from "../identity/identity.service.js";
import { EnquiryModule } from "./enquiry.module.js";
import { EnquiryService } from "./enquiry.service.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";
const testRun = `enquiry-api-${Date.now()}`;
const retailerToken = "enquiry-retailer-token-1";

function email(label: string): string {
  return normalizeEmail(`${label}.${testRun}@example.test`);
}

function label(value: string): string {
  return `${value} ${testRun}`;
}

describe("enquiry service", () => {
  let prisma: PrismaClient;
  let enquiries: EnquiryService;
  let moduleRef: TestingModule;
  let retailerId: string;
  let otherRetailerId: string;
  let distributorId: string;
  let staffId: string;
  let adminId: string;
  let retailerOrgId: string;
  let otherRetailerOrgId: string;
  let distributorOrgId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, EnquiryModule],
    }).compile();
    enquiries = moduleRef.get(EnquiryService);
    retailerId = await user("retailer");
    otherRetailerId = await user("other-retailer");
    distributorId = await user("distributor");
    staffId = await user("staff");
    adminId = await user("admin");
    retailerOrgId = await organization("shop", OrganizationType.RETAILER);
    otherRetailerOrgId = await organization("other-shop", OrganizationType.RETAILER);
    distributorOrgId = await organization("dist", OrganizationType.DISTRIBUTOR);
    const platformId = await organization("platform", OrganizationType.PLATFORM);
    await membership(retailerId, retailerOrgId, MembershipRole.RETAILER_OWNER);
    await membership(otherRetailerId, otherRetailerOrgId, MembershipRole.RETAILER_STAFF);
    await membership(distributorId, distributorOrgId, MembershipRole.DISTRIBUTOR_OWNER);
    await membership(staffId, distributorOrgId, MembershipRole.DISTRIBUTOR_STAFF);
    await membership(adminId, platformId, MembershipRole.PLATFORM_ADMIN);
  });

  afterAll(async () => {
    await moduleRef.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.procurementEnquiryAuditEvent.deleteMany({
      where: { retailerOrganization: { slug: { contains: testRun } } },
    });
    await prisma.procurementEnquiry.deleteMany({
      where: { retailerOrganization: { slug: { contains: testRun } } },
    });
    await prisma.distributorListing.deleteMany({
      where: { organization: { slug: { contains: testRun } } },
    });
    await prisma.medicinePack.deleteMany({ where: { description: { contains: testRun } } });
    await prisma.medicine.deleteMany({ where: { normalizedDisplayName: { contains: testRun } } });
  });

  it("creates an enquiry for an active listing and records the audit with it", async () => {
    const pack = await packFor(label("Visible"), true);
    const listing = await listingFor(distributorOrgId, pack.id, ListingStatus.ACTIVE);
    const before = await prisma.procurementEnquiry.count({ where: { listingId: listing.id } });
    const created = await enquiries.create(retailerId, retailerOrgId, {
      listingId: listing.id,
      requestedPackQuantity: 3,
      message: "Need packs",
    });
    expect(created.status).toBe("OPEN");
    expect(created.requestedQuantity).toBe(3);
    expect(created.distributorOrganizationId).toBe(distributorOrgId);
    expect(created.listing.unitPrice.toString()).toBe(listing.unitPrice.toString());
    expect(await prisma.procurementEnquiry.count({ where: { listingId: listing.id } })).toBe(before + 1);
    expect(
      await prisma.procurementEnquiryAuditEvent.count({
        where: { enquiryId: created.id, action: "enquiry.create", actorUserId: retailerId },
      }),
    ).toBe(1);

    await expect(
      enquiries.create(distributorId, distributorOrgId, {
        listingId: listing.id,
        requestedPackQuantity: 1,
      }),
    ).rejects.toBeInstanceOf(EnquiryForbiddenError);
    await expect(
      enquiries.create(retailerId, otherRetailerOrgId, {
        listingId: listing.id,
        requestedPackQuantity: 1,
      }),
    ).rejects.toBeInstanceOf(EnquiryForbiddenError);
    await expect(
      enquiries.listForRetailer(otherRetailerId, retailerOrgId, 1, 20),
    ).rejects.toBeInstanceOf(EnquiryForbiddenError);
    await expect(enquiries.getForDistributor(otherRetailerId, created.id)).rejects.toBeInstanceOf(
      EnquiryForbiddenError,
    );
  });

  it("rejects listings and medicines that a retailer cannot currently discover", async () => {
    const visible = await packFor(label("Open"), true);
    const hidden = await packFor(label("Hidden"), false);
    const active = await listingFor(distributorOrgId, visible.id, ListingStatus.ACTIVE);
    const paused = await listingFor(distributorOrgId, (await packFor(label("Paused"), true)).id, ListingStatus.PAUSED);
    const hiddenListing = await listingFor(distributorOrgId, hidden.id, ListingStatus.ACTIVE);
    await prisma.organization.update({
      where: { id: distributorOrgId },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    try {
      await expect(
        enquiries.create(retailerId, retailerOrgId, { listingId: active.id, requestedPackQuantity: 1 }),
      ).rejects.toBeInstanceOf(EnquiryTargetUnavailableError);
    } finally {
      await prisma.organization.update({
        where: { id: distributorOrgId },
        data: { status: OrganizationStatus.ACTIVE },
      });
    }
    await expect(
      enquiries.create(retailerId, retailerOrgId, { listingId: paused.id, requestedPackQuantity: 1 }),
    ).rejects.toBeInstanceOf(EnquiryTargetUnavailableError);
    await expect(
      enquiries.create(retailerId, retailerOrgId, {
        listingId: hiddenListing.id,
        requestedPackQuantity: 1,
      }),
    ).rejects.toBeInstanceOf(EnquiryTargetUnavailableError);
    expect(await prisma.procurementEnquiry.count({ where: { listingId: paused.id } })).toBe(0);

    const ownListing = await listingFor(retailerOrgId, visible.id, ListingStatus.ACTIVE);
    await expect(
      enquiries.create(retailerId, retailerOrgId, {
        listingId: ownListing.id,
        requestedPackQuantity: 1,
      }),
    ).rejects.toBeInstanceOf(SelfEnquiryError);
  });

  it("responds without changing the listing and lets the retailer close", async () => {
    const pack = await packFor(label("Answer"), true);
    const listing = await listingFor(distributorOrgId, pack.id, ListingStatus.ACTIVE);
    const enquiry = await enquiries.create(retailerId, retailerOrgId, {
      listingId: listing.id,
      requestedPackQuantity: 2,
      message: "Please confirm",
    });
    const before = await prisma.distributorListing.findUniqueOrThrow({ where: { id: listing.id } });
    const [first, second] = await Promise.allSettled([
      enquiries.respond(staffId, enquiry.id, "We can discuss this."),
      enquiries.respond(distributorId, enquiry.id, "A second answer."),
    ]);
    const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(
      await prisma.procurementEnquiryAuditEvent.count({
        where: { enquiryId: enquiry.id, action: "enquiry.respond" },
      }),
    ).toBe(1);
    const answered = await enquiries.getForDistributor(distributorId, enquiry.id);
    expect(answered.status).toBe("RESPONDED");
    expect(answered.respondedByUserId).not.toBeNull();
    expect(answered.respondedAt).not.toBeNull();
    expect(answered.requestedQuantity).toBe(2);
    expect(answered.message).toBe("Please confirm");
    const after = await prisma.distributorListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.unitPrice.toString()).toBe(before.unitPrice.toString());
    expect(after.stockStatus).toBe(before.stockStatus);
    expect(after.availableQuantity).toBeNull();
    expect(after.priceUpdatedAt?.toISOString()).toBe(before.priceUpdatedAt?.toISOString());
    expect(after.stockUpdatedAt?.toISOString()).toBe(before.stockUpdatedAt?.toISOString());

    await expect(enquiries.respond(staffId, enquiry.id, "Again")).rejects.toBeInstanceOf(
      InvalidEnquiryTransitionError,
    );
    const closed = await enquiries.close(retailerId, enquiry.id);
    expect(closed.status).toBe("CLOSED");
    await expect(enquiries.respond(staffId, enquiry.id, "Too late")).rejects.toBeInstanceOf(
      InvalidEnquiryTransitionError,
    );
    await expect(enquiries.close(retailerId, enquiry.id)).rejects.toBeInstanceOf(
      InvalidEnquiryTransitionError,
    );
    const adminPage = await enquiries.listForAdmin(adminId, 1, 20);
    expect(adminPage.items.some((item) => item.id === enquiry.id)).toBe(true);
    expect(
      await prisma.procurementEnquiryAuditEvent.count({
        where: { enquiryId: enquiry.id, action: "enquiry.admin_read", actorUserId: adminId },
      }),
    ).toBe(1);
  });

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

  async function listingFor(organizationId: string, medicinePackId: string, status: ListingStatus) {
    return prisma.distributorListing.create({
      data: {
        organizationId,
        medicinePackId,
        status,
        unitPrice: "15.00",
        currency: ListingCurrency.INR,
        minimumOrderQuantity: "1",
        stockStatus: StockStatus.IN_STOCK,
        priceUpdatedAt: new Date("2026-11-01T00:00:00.000Z"),
        stockUpdatedAt: new Date("2026-11-01T00:00:00.000Z"),
      },
    });
  }

  async function user(name: string) {
    const row = await prisma.user.create({
      data: { email: email(name), status: UserStatus.ACTIVE },
    });
    return row.id;
  }

  async function organization(name: string, type: OrganizationType) {
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

describe("enquiry HTTP boundary", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.procurementEnquiryAuditEvent.deleteMany({
      where: { actor: { email: { contains: testRun } } },
    });
    await prisma.procurementEnquiry.deleteMany({
      where: { retailerOrganization: { slug: { contains: testRun } } },
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

  it("rejects client-controlled identity fields and fractional quantities", async () => {
    const app = await httpApp();
    try {
      const identity = app.get(IdentityService);
      const retailer = await identity.provision({
        subject: "enquiry-retailer",
        email: email("http-retailer"),
        emailVerified: true,
        displayName: "Retailer",
      });
      const shop = await prisma.organization.create({
        data: {
          name: label("HTTP Shop"),
          slug: `http-shop-${testRun}`,
          type: OrganizationType.RETAILER,
          status: OrganizationStatus.ACTIVE,
        },
      });
      const distributor = await prisma.organization.create({
        data: {
          name: label("HTTP Dist"),
          slug: `http-dist-${testRun}`,
          type: OrganizationType.DISTRIBUTOR,
          status: OrganizationStatus.ACTIVE,
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
      const medicine = await prisma.medicine.create({
        data: {
          displayName: label("HTTP Medicine"),
          normalizedDisplayName: label("http medicine").toLowerCase(),
          genericName: label("HTTP Generic"),
          dosageForm: "Tablet",
          status: CatalogStatus.PUBLISHED,
          searchVisible: true,
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
      const listing = await prisma.distributorListing.create({
        data: {
          organizationId: distributor.id,
          medicinePackId: pack.id,
          unitPrice: "9",
          currency: ListingCurrency.INR,
          minimumOrderQuantity: "1",
          stockStatus: StockStatus.UNKNOWN,
        },
      });
      const rejected = await request(app.getHttpServer())
        .post("/retailer/enquiries")
        .query({ organizationId: shop.id })
        .set("Authorization", `Bearer ${retailerToken}`)
        .send({
          listingId: listing.id,
          requestedPackQuantity: 1.5,
          role: "RETAILER_OWNER",
          distributorOrganizationId: distributor.id,
          status: "RESPONDED",
        });
      expect(rejected.status).toBe(400);

      const created = await request(app.getHttpServer())
        .post("/retailer/enquiries")
        .query({ organizationId: shop.id })
        .set("Authorization", `Bearer ${retailerToken}`)
        .send({ listingId: listing.id, requestedPackQuantity: 2 })
        .expect(201);
      expect(created.body.kind).toBe("enquiry");
      expect(created.body.quantityMeaning).toBe("catalog_packs");
      expect(created.body.requestedPackQuantity).toBe(2);
      expect(created.body.counterpartyName).toBe(label("HTTP Dist"));
      expect(created.body.notice).toContain("not an order");
      expect(JSON.stringify(created.body)).not.toContain("sourceNote");
    } finally {
      await app.close();
    }
  });

  async function httpApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [EnquiryModule] })
      .overrideProvider(IDENTITY_VERIFIER)
      .useValue({
        verify: async (token: string) => {
          if (token !== retailerToken) {
            throw new Error("unexpected token");
          }
          return {
            subject: "enquiry-retailer",
            email: email("http-retailer"),
            emailVerified: true,
            displayName: "Retailer",
          };
        },
      })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }
});
