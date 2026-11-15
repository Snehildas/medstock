import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { assertDemoDatabase, createPrismaClient, readDatabasePoolMax } from "@medstock/database";
import { demoModeEnabled } from "@medstock/shared-types";
import { assertRuntimeConfig } from "./config/runtime-config.js";
import { rateLimitRequests } from "./http/rate-limit.middleware.js";
import { requestContext } from "./http/request-context.js";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  assertRuntimeConfig(process.env);
  if (demoModeEnabled(process.env)) {
    const databaseUrl = process.env.DATABASE_URL ?? "";
    const prisma = createPrismaClient(databaseUrl, readDatabasePoolMax(process.env.DATABASE_POOL_MAX));
    try {
      await assertDemoDatabase(prisma, databaseUrl);
    } finally {
      await prisma.$disconnect();
    }
  }
  const app = await NestFactory.create(AppModule);
  app.use(requestContext);
  app.use(rateLimitRequests);
  app.enableShutdownHooks();
  const webOrigin = process.env.WEB_ORIGIN?.trim();
  if (webOrigin && webOrigin !== "*") {
    app.enableCors({ origin: webOrigin, credentials: false });
  }
  const port = process.env.PORT ?? "3001";
  await app.listen(port);
}

void bootstrap();
