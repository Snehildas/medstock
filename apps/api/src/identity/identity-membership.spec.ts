import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import {
  createPrismaClient,
  IdentityProvider,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  UserStatus,
  type PrismaClient,
} from "@medstock/database";
import { apiErrorSchema, currentUserResponseSchema, membershipResponseSchema } from "@medstock/shared-types";
import request from "supertest";
import { AppModule } from "../app.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { MembershipService } from "../membership/membership.service.js";
import {
  DuplicateMembershipError,
  DisabledIdentityError,
  IdentityLinkRequiredError,
  InvalidMembershipRoleError,
  InvalidMembershipTransitionError,
  OrganizationIneligibleError,
  UnauthorizedOrganizationError,
  UnverifiedIdentityError,
  UserIneligibleError,
} from "./domain-error.js";
import { IdentityHttpModule } from "./identity-http.module.js";
import { IdentityService } from "./identity.service.js";
import { IDENTITY_VERIFIER, StaticIdentityVerifier } from "./identity-verifier.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://medstock:medstock@localhost:5432/medstock";
const testRun = `identity-${Date.now()}`;
const ownerToken = "test-token-static-identity";

function email(label: string): string {
  return `${label}.${testRun}@example.test`;
}

function slug(label: string): string {
  return `${label}-${testRun}`;
}

describe("identity and membership services", () => {
  let prisma: PrismaClient;
  let identityService: IdentityService;
  let membershipService: MembershipService;

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
    identityService = new IdentityService(prisma);
    membershipService = new MembershipService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.organizationMembership.deleteMany({
      where: { user: { email: { contains: testRun } } },
    });
    await prisma.identityAccount.deleteMany({
      where: { user: { email: { contains: testRun } } },
    });
    await prisma.user.deleteMany({ where: { email: { contains: testRun } } });
    await prisma.organization.deleteMany({ where: { slug: { contains: testRun } } });
  });

  it("stores the normalized verified email and ignores a second unverified address", async () => {
    const user = await identityService.provision({
      subject: "subject-owner",
      email: `  Owner.${testRun}@Example.TEST `,
      emailVerified: true,
      displayName: "Owner",
    });

    expect(user.email).toBe(email("owner"));
    expect(user.status).toBe(UserStatus.INVITED);

    await expect(
      identityService.provision({
        subject: "subject-unverified",
        email: ` Other.${testRun}@Example.TEST `,
        emailVerified: false,
        displayName: "Other",
      }),
    ).rejects.toBeInstanceOf(UnverifiedIdentityError);
    expect(
      await prisma.user.count({ where: { email: email("other") } }),
    ).toBe(0);
  });

  it("returns the existing user when the same Cognito subject is provisioned twice", async () => {
    const identity = {
      subject: "subject-race",
      email: email("race"),
      emailVerified: true,
      displayName: "Race",
    };
    const [first, second] = await Promise.all([
      identityService.provision(identity),
      identityService.provision(identity),
    ]);

    expect(first.id).toBe(second.id);
    expect(await prisma.user.count({ where: { email: email("race") } })).toBe(1);
    expect(
      await prisma.identityAccount.count({
        where: { provider: IdentityProvider.COGNITO, providerSubject: "subject-race" },
      }),
    ).toBe(1);
  });

  it("does not link a new subject to an existing user with the same email", async () => {
    await prisma.user.create({
      data: { email: email("taken"), status: UserStatus.ACTIVE, name: "Existing" },
    });

    await expect(
      identityService.provision({
        subject: "subject-new",
        email: ` Taken.${testRun}@Example.TEST `,
        emailVerified: true,
        displayName: "Newcomer",
      }),
    ).rejects.toBeInstanceOf(IdentityLinkRequiredError);
    expect(await prisma.identityAccount.count({ where: { providerSubject: "subject-new" } })).toBe(
      0,
    );
  });

  it("returns the mapped user without taking a new email or changing status", async () => {
    const existing = await prisma.user.create({
      data: { email: email("disabled"), status: UserStatus.DISABLED },
    });
    await prisma.identityAccount.create({
      data: {
        userId: existing.id,
        provider: IdentityProvider.COGNITO,
        providerSubject: "subject-disabled",
      },
    });

    await expect(
      identityService.provision({
        subject: "subject-disabled",
        email: email("other-address"),
        emailVerified: true,
        displayName: "Disabled",
      }),
    ).rejects.toBeInstanceOf(DisabledIdentityError);

    const user = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(user?.status).toBe(UserStatus.DISABLED);
    expect(user?.email).toBe(email("disabled"));
    expect(user?.name).toBeNull();
  });

  it("adds one user to two organizations and rejects a duplicate membership", async () => {
    const owner = await identityService.provision({
      subject: "subject-owner",
      email: email("owner"),
      emailVerified: true,
      displayName: "Owner",
    });
    const member = await identityService.provision({
      subject: "subject-member",
      email: email("member"),
      emailVerified: true,
      displayName: "Member",
    });
    const retailer = await prisma.organization.create({
      data: { name: "Retail", slug: slug("retail"), type: OrganizationType.RETAILER },
    });
    const distributor = await prisma.organization.create({
      data: { name: "Distributor", slug: slug("distributor"), type: OrganizationType.DISTRIBUTOR },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: owner.id,
        organizationId: retailer.id,
        role: MembershipRole.RETAILER_OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: owner.id,
        organizationId: distributor.id,
        role: MembershipRole.DISTRIBUTOR_OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });

    const first = await membershipService.createMembership({
      actorUserId: owner.id,
      organizationId: retailer.id,
      userId: member.id,
      role: MembershipRole.RETAILER_STAFF,
    });
    const second = await membershipService.createMembership({
      actorUserId: owner.id,
      organizationId: distributor.id,
      userId: member.id,
      role: MembershipRole.DISTRIBUTOR_STAFF,
    });

    expect(first.status).toBe(MembershipStatus.INVITED);
    expect(second.organizationId).not.toBe(first.organizationId);
    await expect(
      membershipService.createMembership({
        actorUserId: owner.id,
        organizationId: retailer.id,
        userId: member.id,
        role: MembershipRole.RETAILER_STAFF,
      }),
    ).rejects.toBeInstanceOf(DuplicateMembershipError);
    expect(
      await prisma.organizationMembership.count({
        where: { userId: member.id, organizationId: retailer.id },
      }),
    ).toBe(1);
  });

  it("does not let staff assign an owner membership", async () => {
    const { retailer, member } = await seedRetailer();
    const staff = await seedMember();
    await prisma.organizationMembership.create({
      data: {
        userId: staff.id,
        organizationId: retailer.id,
        role: MembershipRole.RETAILER_STAFF,
        status: MembershipStatus.ACTIVE,
      },
    });
    await expect(
      membershipService.createMembership({
        actorUserId: staff.id,
        organizationId: retailer.id,
        userId: member.id,
        role: MembershipRole.RETAILER_OWNER,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedOrganizationError);
  });

  it("rejects a role that does not match the organization and leaves no row", async () => {
    const { owner, retailer, member } = await seedRetailer();
    await expect(
      membershipService.createMembership({
        actorUserId: owner.id,
        organizationId: retailer.id,
        userId: member.id,
        role: MembershipRole.DISTRIBUTOR_OWNER,
      }),
    ).rejects.toBeInstanceOf(InvalidMembershipRoleError);
    expect(
      await prisma.organizationMembership.count({ where: { userId: member.id } }),
    ).toBe(0);
  });

  it("does not let a retailer owner create a platform admin", async () => {
    const { owner, retailer, member } = await seedRetailer();
    const platform = await prisma.organization.create({
      data: { name: "Platform", slug: slug("platform"), type: OrganizationType.PLATFORM },
    });

    await expect(
      membershipService.createMembership({
        actorUserId: owner.id,
        organizationId: retailer.id,
        userId: member.id,
        role: MembershipRole.PLATFORM_ADMIN,
      }),
    ).rejects.toBeInstanceOf(InvalidMembershipRoleError);
    await expect(
      membershipService.createMembership({
        actorUserId: owner.id,
        organizationId: platform.id,
        userId: member.id,
        role: MembershipRole.PLATFORM_ADMIN,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedOrganizationError);
  });

  it("rejects a new membership when the organization is suspended", async () => {
    const { owner, retailer, member } = await seedRetailer();
    await prisma.organization.update({
      where: { id: retailer.id },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    await expect(
      membershipService.createMembership({
        actorUserId: owner.id,
        organizationId: retailer.id,
        userId: member.id,
        role: MembershipRole.RETAILER_STAFF,
      }),
    ).rejects.toBeInstanceOf(OrganizationIneligibleError);
  });

  it("rejects a disabled user and an invalid status transition", async () => {
    const { owner, retailer } = await seedRetailer();
    const disabled = await prisma.user.create({
      data: { email: email("blocked"), status: UserStatus.DISABLED },
    });
    await expect(
      membershipService.createMembership({
        actorUserId: owner.id,
        organizationId: retailer.id,
        userId: disabled.id,
        role: MembershipRole.RETAILER_STAFF,
      }),
    ).rejects.toBeInstanceOf(UserIneligibleError);

    const invited = await membershipService.createMembership({
      actorUserId: owner.id,
      organizationId: retailer.id,
      userId: (await seedMember()).id,
      role: MembershipRole.RETAILER_STAFF,
    });
    const active = await membershipService.transitionStatus({
      actorUserId: owner.id,
      membershipId: invited.id,
      nextStatus: MembershipStatus.ACTIVE,
    });
    expect(active.status).toBe(MembershipStatus.ACTIVE);
    await expect(
      membershipService.transitionStatus({
        actorUserId: owner.id,
        membershipId: invited.id,
        nextStatus: MembershipStatus.INVITED,
      }),
    ).rejects.toBeInstanceOf(InvalidMembershipTransitionError);
  });

  it("returns only the requested organization's memberships", async () => {
    const { owner, retailer, member } = await seedRetailer();
    const other = await prisma.organization.create({
      data: { name: "Other", slug: slug("other"), type: OrganizationType.RETAILER },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: owner.id,
        organizationId: other.id,
        role: MembershipRole.RETAILER_OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    await membershipService.createMembership({
      actorUserId: owner.id,
      organizationId: retailer.id,
      userId: member.id,
      role: MembershipRole.RETAILER_STAFF,
    });
    await membershipService.createMembership({
      actorUserId: owner.id,
      organizationId: other.id,
      userId: member.id,
      role: MembershipRole.RETAILER_STAFF,
    });

    const listed = await membershipService.listForOrganization(owner.id, retailer.id);
    expect(listed.every((membership) => membership.organizationId === retailer.id)).toBe(true);
    expect(listed.some((membership) => membership.organizationId === other.id)).toBe(false);
  });

  async function seedMember(): Promise<{ id: string }> {
    return identityService.provision({
      subject: `subject-member-${Math.random()}`,
      email: email(`member-${Math.random().toString(16).slice(2)}`),
      emailVerified: true,
      displayName: "Member",
    });
  }

  async function seedRetailer(): Promise<{
    owner: { id: string };
    retailer: { id: string };
    member: { id: string };
  }> {
    const owner = await identityService.provision({
      subject: `subject-owner-${Math.random()}`,
      email: email(`owner-${Math.random().toString(16).slice(2)}`),
      emailVerified: true,
      displayName: "Owner",
    });
    const member = await seedMember();
    const retailer = await prisma.organization.create({
      data: {
        name: "Retail",
        slug: slug(`retail-${Math.random().toString(16).slice(2)}`),
        type: OrganizationType.RETAILER,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: owner.id,
        organizationId: retailer.id,
        role: MembershipRole.RETAILER_OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    return { owner, retailer, member };
  }
});

describe("identity HTTP boundary", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    prisma = createPrismaClient(databaseUrl);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.organizationMembership.deleteMany({
      where: { user: { email: { contains: testRun } } },
    });
    await prisma.identityAccount.deleteMany({
      where: { user: { email: { contains: testRun } } },
    });
    await prisma.user.deleteMany({ where: { email: { contains: testRun } } });
    await prisma.organization.deleteMany({ where: { slug: { contains: testRun } } });
  });

  it("mounts identity routes and rejects a missing bearer token", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const response = await request(app.getHttpServer())
      .post("/organizations/00000000-0000-4000-8000-000000000001/memberships")
      .expect(401);
    expect(apiErrorSchema.parse(response.body).error.code).toBe("invalid_identity");
    await app.close();
  });

  it("uses the verified identity and rejects a body email and a bad token", async () => {
    const app = await createHttpApp();
    const owner = await request(app.getHttpServer())
      .get("/identity/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const retailer = await prisma.organization.create({
      data: { name: "Retail", slug: slug("http-retail"), type: OrganizationType.RETAILER },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: owner.body.id as string,
        organizationId: retailer.id,
        role: MembershipRole.RETAILER_OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const invitee = await prisma.user.create({
      data: { email: email("invitee"), name: "Invitee" },
    });

    const rejected = await request(app.getHttpServer())
      .post(`/organizations/${retailer.id}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        userId: invitee.id,
        role: MembershipRole.RETAILER_STAFF,
        email: "attacker@example.test",
      })
      .expect(400);
    expect(JSON.stringify(rejected.body)).toContain("email");

    const created = await request(app.getHttpServer())
      .post(`/organizations/${retailer.id}/memberships`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ userId: invitee.id, role: MembershipRole.RETAILER_STAFF })
      .expect(201);
    const membership = membershipResponseSchema.parse(created.body);
    expect(membership.user.email).toBe(email("invitee"));
    expect(membership.user.id).not.toBe(owner.body.id);

    const current = await request(app.getHttpServer())
      .get("/identity/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const account = currentUserResponseSchema.parse(current.body);
    expect(account.memberships.map((item) => item.organization.name)).toContain("Retail");

    const invalid = await request(app.getHttpServer())
      .get("/identity/me")
      .set("Authorization", "Bearer not-the-test-token")
      .expect(401);
    expect(apiErrorSchema.parse(invalid.body).error.code).toBe("invalid_identity");
    await app.close();
  });

  it("rejects the same access token after the local user is disabled", async () => {
    const app = await createHttpApp();
    const signedIn = await request(app.getHttpServer())
      .get("/identity/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    await prisma.user.update({
      where: { id: signedIn.body.id as string },
      data: { status: UserStatus.DISABLED },
    });
    const rejected = await request(app.getHttpServer())
      .get("/identity/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(403);
    expect(apiErrorSchema.parse(rejected.body).error.code).toBe("disabled_identity");
    await app.close();
  });

  async function createHttpApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityHttpModule, DatabaseModule],
    })
      .overrideProvider(IDENTITY_VERIFIER)
      .useValue(
        new StaticIdentityVerifier(ownerToken, {
          subject: "http-owner",
          email: email("http-owner"),
          emailVerified: true,
          displayName: "HTTP Owner",
        }),
      )
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }
});
