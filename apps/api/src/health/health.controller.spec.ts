import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { healthResponseSchema, readinessResponseSchema } from "@medstock/shared-types";
import { AppModule } from "../app.module.js";

describe("GET /health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      "postgresql://medstock:medstock@localhost:5432/medstock";
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the shared health contract", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: "ok",
      service: "medstock-api",
    });
  });

  it("reports readiness only after the database answers", async () => {
    const response = await request(app.getHttpServer()).get("/health/ready").expect(200);
    expect(readinessResponseSchema.parse(response.body)).toEqual({
      status: "ready",
      service: "medstock-api",
    });
    expect(JSON.stringify(response.body)).not.toContain("postgresql");
  });
});
