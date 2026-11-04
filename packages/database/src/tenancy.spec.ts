import {
  assertMembershipRole,
  createPrismaClient,
  MembershipRole,
  MembershipRoleError,
  normalizeEmail,
  OrganizationType,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://medstock:medstock@localhost:5432/medstock";

const prisma = createPrismaClient(databaseUrl);
const testRun = `tenancy-${Date.now()}`;

function email(label: string): string {
  return normalizeEmail(`${label}.${testRun}@example.test`);
}

function slug(label: string): string {
  return `${label}-${testRun}`;
}

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.organizationMembership.deleteMany({
    where: { user: { email: { contains: testRun } } },
  });
  await prisma.user.deleteMany({
    where: { email: { contains: testRun } },
  });
  await prisma.organization.deleteMany({
    where: { slug: { contains: testRun } },
  });
});

describe("tenancy", () => {
  it("stores a user without an organization", async () => {
    const user = await prisma.user.create({
      data: { email: email("solo"), name: "Solo User" },
    });

    const memberships = await prisma.organizationMembership.count({
      where: { userId: user.id },
    });

    expect(memberships).toBe(0);
  });

  it("lets one user belong to more than one organization", async () => {
    const user = await prisma.user.create({
      data: { email: email("multi") },
    });
    const retailer = await prisma.organization.create({
      data: {
        name: "Retail test",
        slug: slug("retail"),
        type: OrganizationType.RETAILER,
      },
    });
    const distributor = await prisma.organization.create({
      data: {
        name: "Distributor test",
        slug: slug("distributor"),
        type: OrganizationType.DISTRIBUTOR,
      },
    });

    assertMembershipRole(retailer.type, MembershipRole.RETAILER_STAFF);
    assertMembershipRole(distributor.type, MembershipRole.DISTRIBUTOR_OWNER);

    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: retailer.id,
        role: MembershipRole.RETAILER_STAFF,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: distributor.id,
        role: MembershipRole.DISTRIBUTOR_OWNER,
      },
    });

    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id },
    });
    expect(memberships).toHaveLength(2);
  });

  it("rejects a duplicate membership for the same user and organization", async () => {
    const user = await prisma.user.create({
      data: { email: email("duplicate") },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Retail test",
        slug: slug("duplicate"),
        type: OrganizationType.RETAILER,
      },
    });
    const data = {
      userId: user.id,
      organizationId: organization.id,
      role: MembershipRole.RETAILER_OWNER,
    };

    await prisma.organizationMembership.create({ data });
    await expect(prisma.organizationMembership.create({ data })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("rejects a duplicate organization slug", async () => {
    const sharedSlug = slug("shared");
    await prisma.organization.create({
      data: {
        name: "First",
        slug: sharedSlug,
        type: OrganizationType.RETAILER,
      },
    });

    await expect(
      prisma.organization.create({
        data: {
          name: "Second",
          slug: sharedSlug,
          type: OrganizationType.DISTRIBUTOR,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a membership whose user does not exist", async () => {
    const organization = await prisma.organization.create({
      data: {
        name: "Retail test",
        slug: slug("missing-user"),
        type: OrganizationType.RETAILER,
      },
    });

    await expect(
      prisma.organizationMembership.create({
        data: {
          userId: "00000000-0000-4000-8000-000000000001",
          organizationId: organization.id,
          role: MembershipRole.RETAILER_STAFF,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("refuses to delete a user who still has a membership", async () => {
    const user = await prisma.user.create({
      data: { email: email("keep-user") },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Retail test",
        slug: slug("keep-user"),
        type: OrganizationType.RETAILER,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: MembershipRole.RETAILER_OWNER,
      },
    });

    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({
      code: "P2003",
    });
    await expect(
      prisma.organization.delete({ where: { id: organization.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("normalizes email before persistence", () => {
    expect(normalizeEmail("  Person@Example.TEST ")).toBe("person@example.test");
  });

  it("rejects a retailer role on a distributor organization", () => {
    expect(() =>
      assertMembershipRole(OrganizationType.DISTRIBUTOR, MembershipRole.RETAILER_OWNER),
    ).toThrow(MembershipRoleError);
  });
});
