import { createPrismaClient } from "../index.js";
import { assertDemoDatabase } from "./assert-demo-database.js";
import { evaluateDemoDatabase, evaluateDemoDatabaseUrl } from "./database-target.js";

const neonUrl = "postgresql://demo:secret@ep-example-pooler.ap-southeast-1.aws.neon.tech/medstock_demo?sslmode=require";

describe("demo database identity", () => {
  it("accepts only a Neon database named medstock_demo", () => {
    expect(evaluateDemoDatabaseUrl(neonUrl)).toEqual({ ok: true });
    expect(
      evaluateDemoDatabase({ connectionString: neonUrl, currentDatabase: "medstock_demo" }),
    ).toEqual({ ok: true });
    expect(evaluateDemoDatabaseUrl("postgresql://medstock:medstock@localhost:5433/medstock").ok).toBe(false);
    expect(evaluateDemoDatabaseUrl("postgresql://medstock:medstock@localhost:5432/medstock_demo").ok).toBe(false);
    expect(evaluateDemoDatabaseUrl("postgresql://demo:secret@ep-example.ap-southeast-1.aws.neon.tech/medstock").ok).toBe(false);
    expect(evaluateDemoDatabaseUrl("postgresql://demo:secret@db.example.com:5433/medstock_demo").ok).toBe(false);
    expect(
      evaluateDemoDatabase({ connectionString: neonUrl, currentDatabase: "medstock" }).ok,
    ).toBe(false);
  });

  it("refuses the running local database before any write", async () => {
    const databaseUrl = process.env.DATABASE_URL ?? "";
    const prisma = createPrismaClient(databaseUrl);
    await expect(assertDemoDatabase(prisma, databaseUrl)).rejects.toThrow(/Refusing|medstock_demo|Neon/);
    await prisma.$disconnect();
  });
});
