import { defineConfig } from "prisma/config";

// Local Compose placeholder so `prisma generate` can load config without a secret.
// Runtime connections must use DATABASE_URL from the environment.
const localDatabaseUrl =
  "postgresql://medstock:medstock@localhost:5432/medstock";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
