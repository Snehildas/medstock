import { PrismaClient } from "../generated/prisma/client.js";
import { evaluateDemoDatabase } from "./database-target.js";

export class DemoDatabaseRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoDatabaseRefused";
  }
}

export async function assertDemoDatabase(prisma: PrismaClient, connectionString: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const currentDatabase = rows[0]?.current_database ?? "";
  const decision = evaluateDemoDatabase({ connectionString, currentDatabase });
  if (!decision.ok) {
    throw new DemoDatabaseRefused(decision.reason);
  }
}
