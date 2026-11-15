import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export { PrismaClient };
export { Prisma } from "./generated/prisma/client.js";
export {
  CatalogStatus,
  EnquiryStatus,
  IdentityProvider,
  IngredientKind,
  ListingCurrency,
  ListingImportAction,
  ListingImportOutcome,
  ListingImportStatus,
  ListingSource,
  ListingStatus,
  MedicineCompanyRole,
  MedicineSubmissionStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  PackUnit,
  StockStatus,
  StrengthUnit,
  UserStatus,
} from "./generated/prisma/client.js";
export { normalizeCatalogName } from "./catalog-name.js";
export { normalizeEmail } from "./email.js";
export { assertMembershipRole, MembershipRoleError } from "./membership-role.js";
export { evaluateDemoDatabase, evaluateDemoDatabaseUrl } from "./demo/database-target.js";
export { assertDemoDatabase } from "./demo/assert-demo-database.js";

export function readDatabasePoolMax(value: string | undefined): number | undefined {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    return undefined;
  }
  if (!/^[1-5]$/.test(trimmed)) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 to 5.");
  }
  return Number(trimmed);
}

export function createPrismaClient(databaseUrl: string, maxConnections?: number): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    ...(maxConnections === undefined ? {} : { max: maxConnections }),
  });
  return new PrismaClient({ adapter });
}
