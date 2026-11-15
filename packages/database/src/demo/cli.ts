import { demoModeEnabled } from "@medstock/shared-types";
import { createPrismaClient } from "../index.js";
import { assertDemoDatabase } from "./assert-demo-database.js";
import { clearDemoDatabase, seedDemoDatabase } from "./seed.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exitCode = 1;
    return;
  }
  const prisma = createPrismaClient(databaseUrl);
  try {
    await assertDemoDatabase(prisma, databaseUrl);
    if (command === "assert") {
      console.log("Demo database identity accepted.");
    } else if (command === "seed" || command === "reset") {
      if (!demoModeEnabled(process.env) || process.env.MEDSTOCK_DEMO_SEED !== "confirm") {
        throw new Error("Refusing to change the demo database. Set MEDSTOCK_DEMO_MODE=true and MEDSTOCK_DEMO_SEED=confirm.");
      }
      if (command === "reset") {
        await clearDemoDatabase(prisma);
      }
      await seedDemoDatabase(prisma);
      console.log(command === "reset" ? "Demo database reset and seeded." : "Demo database seeded.");
    } else {
      throw new Error("Use assert, seed, or reset.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Demo database command failed.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
