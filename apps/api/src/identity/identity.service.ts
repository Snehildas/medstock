import { Injectable } from "@nestjs/common";
import {
  IdentityProvider,
  normalizeEmail,
  PrismaClient,
  UserStatus,
  type PrismaClient as MedstockPrisma,
} from "@medstock/database";
import {
  IdentityLinkRequiredError,
  InvalidIdentityError,
  UnverifiedIdentityError,
} from "./domain-error.js";
import type { VerifiedIdentity } from "./identity-verifier.js";
import { prismaErrorCode } from "./prisma-error.js";

type UserRecord = Awaited<ReturnType<MedstockPrisma["user"]["create"]>>;

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaClient) {}

  async provision(identity: VerifiedIdentity): Promise<UserRecord> {
    if (identity.subject.trim().length === 0) {
      throw new InvalidIdentityError();
    }
    if (!identity.emailVerified) {
      throw new UnverifiedIdentityError();
    }

    let email: string;
    try {
      email = normalizeEmail(identity.email);
    } catch {
      throw new InvalidIdentityError();
    }

    const subject = identity.subject.trim();

    try {
      return await this.prisma.$transaction((tx) =>
        this.provisionInTransaction(tx, {
          subject,
          email,
          displayName: identity.displayName,
        }),
      );
    } catch (error) {
      if (prismaErrorCode(error) !== "P2002") {
        throw error;
      }
      return this.resolveUniqueConflict(subject, email);
    }
  }

  private async provisionInTransaction(
    tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
    input: { subject: string; email: string; displayName: string | null },
  ): Promise<UserRecord> {
    const mapped = await tx.identityAccount.findUnique({
      where: {
        provider_providerSubject: {
          provider: IdentityProvider.COGNITO,
          providerSubject: input.subject,
        },
      },
      include: { user: true },
    });
    if (mapped) {
      return mapped.user;
    }

    const existingUser = await tx.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      throw new IdentityLinkRequiredError();
    }

    return tx.user.create({
      data: {
        email: input.email,
        name: input.displayName,
        status: UserStatus.INVITED,
        identityAccounts: {
          create: {
            provider: IdentityProvider.COGNITO,
            providerSubject: input.subject,
          },
        },
      },
    });
  }

  private async resolveUniqueConflict(subject: string, email: string): Promise<UserRecord> {
    const mapped = await this.prisma.identityAccount.findUnique({
      where: {
        provider_providerSubject: {
          provider: IdentityProvider.COGNITO,
          providerSubject: subject,
        },
      },
      include: { user: true },
    });
    if (mapped) {
      return mapped.user;
    }
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new IdentityLinkRequiredError();
    }
    throw new IdentityLinkRequiredError();
  }
}
