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

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
