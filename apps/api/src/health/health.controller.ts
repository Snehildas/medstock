import { Controller, Get, Res } from "@nestjs/common";
import { PrismaClient } from "@medstock/database";
import {
  healthResponseSchema,
  readinessResponseSchema,
  type HealthResponse,
  type ReadinessResponse,
} from "@medstock/shared-types";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({
      status: "ok",
      service: "medstock-api",
    });
  }

  @Get("ready")
  async getReady(@Res({ passthrough: true }) response: { status(code: number): void }): Promise<ReadinessResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      response.status(503);
      return readinessResponseSchema.parse({ status: "unavailable", service: "medstock-api" });
    }
    return readinessResponseSchema.parse({ status: "ready", service: "medstock-api" });
  }
}
