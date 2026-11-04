import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import {
  CatalogStatus,
  IngredientKind,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  UserStatus,
  createPrismaClient,
  normalizeEmail,
  type PrismaClient,
} from "@medstock/database";
import { medicinePageSchema } from "@medstock/shared-types";
import { DatabaseModule } from "../database/database.module.js";
import {
  CatalogDraftRequiredError,
  CatalogForbiddenError,
  DuplicateCatalogRecordError,
  InvalidCatalogTransitionError,
  MedicineNotFoundError,
} from "../identity/domain-error.js";
import { IdentityHttpModule } from "../identity/identity-http.module.js";
import { IDENTITY_VERIFIER, StaticIdentityVerifier } from "../identity/identity-verifier.js";
import { IdentityService } from "../identity/identity.service.js";
import { CatalogModule } from "./catalog.module.js";
import { CatalogService } from "./catalog.service.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";
const testRun = `catalog-api-${Date.now()}`;
const adminToken = "catalog-admin-token-0001";
const retailerToken = "catalog-retailer-token-01";

function email(label: string): string {
  return normalizeEmail(`${label}.${testRun}@example.test`);
}

function label(value: string): string {
  return `${value} ${testRun}`;
}

describe("catalog service", () => {
  let prisma: PrismaClient;
  let catalog: CatalogService;
  let moduleRef: TestingModule;
  let adminId: string;
  let retailerId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, IdentityHttpModule, CatalogModule],
    }).compile();
    catalog = moduleRef.get(CatalogService);
    adminId = await user("admin");
    retailerId = await user("retailer");
    await membership(adminId, OrganizationType.PLATFORM, MembershipRole.PLATFORM_ADMIN);
    await membership(retailerId, OrganizationType.RETAILER, MembershipRole.RETAILER_OWNER);
  });

  afterAll(async () => {
    await moduleRef.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.catalogAuditEvent.deleteMany({
      where: { actor: { email: { contains: testRun } } },
    });
    await prisma.medicineComposition.deleteMany({
      where: { medicine: { normalizedDisplayName: { contains: testRun } } },
    });
    await prisma.medicinePack.deleteMany({
      where: { medicine: { normalizedDisplayName: { contains: testRun } } },
    });
    await prisma.medicineManufacturer.deleteMany({
      where: { medicine: { normalizedDisplayName: { contains: testRun } } },
    });
    await prisma.medicine.deleteMany({ where: { normalizedDisplayName: { contains: testRun } } });
    await prisma.ingredientAlias.deleteMany({ where: { normalizedAlias: { contains: testRun } } });
    await prisma.ingredient.deleteMany({ where: { normalizedName: { contains: testRun } } });
    await prisma.manufacturer.deleteMany({ where: { normalizedName: { contains: testRun } } });
  });

  it("stores composition strength and rejects a duplicate medicine name", async () => {
    const ingredient = await catalog.createIngredient(adminId, {
      canonicalName: label("Paracetamol"),
      kind: IngredientKind.ACTIVE,
      aliases: [label("PCM")],
    });
    const medicine = await catalog.createMedicine(adminId, {
      displayName: label("Crocin"),
      genericName: label("Paracetamol"),
      dosageForm: "Tablet",
    });
    const withLine = await catalog.replaceComposition(adminId, medicine.id, {
      lines: [
        {
          ingredientId: ingredient.id,
          strengthValue: "500.5",
          strengthUnit: "MG",
          basis: "per tablet",
          sequence: 1,
        },
      ],
    });
    expect(withLine.compositions[0]?.strengthValue.toString()).toBe("500.5");
    expect(withLine.compositions[0]?.strengthUnit).toBe("MG");
    expect(withLine.compositions[0]?.basis).toBe("per tablet");
    await expect(
      catalog.createMedicine(adminId, {
        displayName: `  ${label("CROCIN")}  `,
        genericName: label("Other"),
        dosageForm: "Capsule",
      }),
    ).rejects.toBeInstanceOf(DuplicateCatalogRecordError);
    const audit = await prisma.catalogAuditEvent.findFirst({
      where: { entityId: medicine.id, action: "medicine.create" },
    });
    expect(audit?.actorUserId).toBe(adminId);
  });

  it("publishes searchable medicines and hides drafts, archives, and hidden rows", async () => {
    const ingredient = await catalog.createIngredient(adminId, {
      canonicalName: label("Amoxicillin"),
      kind: "ACTIVE",
      aliases: [label("Amox")],
    });
    const visible = await published(label("Amox Capsule"), ingredient.id);
    const draft = await catalog.createMedicine(adminId, {
      displayName: label("Amox Draft"),
      genericName: label("Amoxicillin"),
      dosageForm: "Capsule",
    });
    const hidden = await catalog.createMedicine(adminId, {
      displayName: label("Amox Hidden"),
      genericName: label("Amoxicillin"),
      dosageForm: "Capsule",
    });
    await catalog.publishMedicine(adminId, hidden.id, { searchVisible: false });
    const archived = await published(label("Amox Archived"), ingredient.id);
    await catalog.archiveMedicine(adminId, archived.id);
    await expect(catalog.archiveMedicine(adminId, archived.id)).rejects.toBeInstanceOf(
      InvalidCatalogTransitionError,
    );
    await expect(
      catalog.updateMedicine(adminId, visible.id, { presentation: "500 mg" }),
    ).rejects.toBeInstanceOf(CatalogDraftRequiredError);

    const exact = await catalog.searchMedicines(label("Amox Capsule"), 1, 20);
    expect(exact.items.map((item) => item.id)).toEqual([visible.id]);

    const partial = await catalog.searchMedicines(`amox ${testRun}`, 1, 20);
    expect(partial.items.map((item) => item.id)).toContain(visible.id);
    expect(partial.items.map((item) => item.id)).not.toContain(draft.id);
    expect(partial.items.map((item) => item.id)).not.toContain(hidden.id);
    expect(partial.items.map((item) => item.id)).not.toContain(archived.id);

    const byIngredient = await catalog.searchMedicines(label("Amox"), 1, 20);
    expect(byIngredient.items.map((item) => item.id)).toContain(visible.id);

    await expect(catalog.getMedicine(retailerId, draft.id)).rejects.toBeInstanceOf(
      MedicineNotFoundError,
    );
    const adminView = await catalog.getMedicine(adminId, draft.id);
    expect(adminView.status).toBe(CatalogStatus.DRAFT);
  });

  it("returns a deterministic page and rejects a non-admin actor", async () => {
    for (const name of ["Alpha", "Beta", "Gamma"]) {
      const medicine = await catalog.createMedicine(adminId, {
        displayName: `${name} ${label("Vitamin")}`,
        genericName: label("Vitamin"),
        dosageForm: "Tablet",
      });
      await catalog.publishMedicine(adminId, medicine.id, { searchVisible: true });
    }
    const first = await catalog.searchMedicines(label("Vitamin"), 1, 2);
    const second = await catalog.searchMedicines(label("Vitamin"), 2, 2);
    const again = await catalog.searchMedicines(label("Vitamin"), 1, 2);
    expect(first.total).toBe(3);
    expect(first.items.map((item) => item.displayName)).toEqual(again.items.map((item) => item.displayName));
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect([...first.items, ...second.items].map((item) => item.displayName)).toEqual([
      `Alpha ${label("Vitamin")}`,
      `Beta ${label("Vitamin")}`,
      `Gamma ${label("Vitamin")}`,
    ]);
    await expect(
      catalog.createMedicine(retailerId, {
        displayName: label("Blocked"),
        genericName: label("Blocked"),
        dosageForm: "Tablet",
      }),
    ).rejects.toBeInstanceOf(CatalogForbiddenError);
  });

  async function published(displayName: string, ingredientId: string) {
    const medicine = await catalog.createMedicine(adminId, {
      displayName,
      genericName: label("Amoxicillin"),
      dosageForm: "Capsule",
    });
    await catalog.replaceComposition(adminId, medicine.id, {
      lines: [
        {
          ingredientId,
          strengthValue: "250",
          strengthUnit: "MG",
          sequence: 1,
        },
      ],
    });
    return catalog.publishMedicine(adminId, medicine.id, { searchVisible: true });
  }

  async function user(name: string): Promise<string> {
    const row = await prisma.user.create({
      data: { email: email(name), status: UserStatus.ACTIVE },
    });
    return row.id;
  }

  async function membership(
    userId: string,
    type: OrganizationType,
    role: MembershipRole,
  ): Promise<void> {
    const organization = await prisma.organization.create({
      data: {
        name: label(type),
        slug: `${type.toLowerCase()}-${testRun}`,
        type,
        status: OrganizationStatus.ACTIVE,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId,
        organizationId: organization.id,
        role,
        status: MembershipStatus.ACTIVE,
      },
    });
  }
});

describe("catalog HTTP boundary", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.catalogAuditEvent.deleteMany({
      where: { actor: { email: { contains: testRun } } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { user: { email: { contains: testRun } } },
    });
    await prisma.identityAccount.deleteMany({
      where: { user: { email: { contains: testRun } } },
    });
    await prisma.medicine.deleteMany({ where: { normalizedDisplayName: { contains: testRun } } });
    await prisma.user.deleteMany({ where: { email: { contains: testRun } } });
    await prisma.organization.deleteMany({ where: { slug: { contains: testRun } } });
  });

  it("uses the verified admin and ignores a role in the body", async () => {
    const app = await httpApp(adminToken, email("http-admin"), "http-admin");
    const retailerApp = await httpApp(retailerToken, email("http-retailer"), "http-retailer");
    try {
    await runAdminHttpCase(app, retailerApp);
    } finally {
      await app.close();
      await retailerApp.close();
    }
  });

  async function runAdminHttpCase(app: INestApplication, retailerApp: INestApplication): Promise<void> {
    const identity = app.get(IdentityService);
    const admin = await identity.provision({
      subject: "http-admin",
      email: email("http-admin"),
      emailVerified: true,
      displayName: "HTTP Admin",
    });
    const organization = await prisma.organization.create({
      data: {
        name: label("HTTP Platform"),
        slug: `http-platform-${testRun}`,
        type: OrganizationType.PLATFORM,
        status: OrganizationStatus.ACTIVE,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: admin.id,
        organizationId: organization.id,
        role: MembershipRole.PLATFORM_ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    const rejected = await request(app.getHttpServer())
      .post("/admin/catalog/medicines")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        displayName: label("HTTP Medicine"),
        genericName: label("HTTP Generic"),
        dosageForm: "Tablet",
        role: "PLATFORM_ADMIN",
      });
    if (rejected.status !== 400) {
      throw new Error(`status ${rejected.status} body ${JSON.stringify(rejected.body)}`);
    }
    expect(JSON.stringify(rejected.body)).toContain("role");

    const created = await request(app.getHttpServer())
      .post("/admin/catalog/medicines")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        displayName: label("HTTP Medicine"),
        genericName: label("HTTP Generic"),
        dosageForm: "Tablet",
      })
      .expect(201);
    expect(created.body.status).toBe("DRAFT");

    await request(retailerApp.getHttpServer())
      .post("/admin/catalog/medicines")
      .set("Authorization", `Bearer ${retailerToken}`)
      .send({
        displayName: label("Retailer Medicine"),
        genericName: label("Retailer Generic"),
        dosageForm: "Tablet",
      })
      .expect(403);

    await catalogPublish(app, created.body.id as string);
    const page = await request(app.getHttpServer())
      .get("/catalog/medicines")
      .query({ q: label("HTTP Medicine"), page: 1, pageSize: 10 })
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(medicinePageSchema.parse(page.body).items).toHaveLength(1);
  }

  async function catalogPublish(app: INestApplication, medicineId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/admin/catalog/medicines/${medicineId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ searchVisible: true })
      .expect(201);
  }

  async function httpApp(token: string, userEmail: string, subject: string): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [CatalogModule],
    })
      .overrideProvider(IDENTITY_VERIFIER)
      .useValue(
        new StaticIdentityVerifier(token, {
          subject,
          email: userEmail,
          emailVerified: true,
          displayName: subject,
        }),
      )
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }
});
