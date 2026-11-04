import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { assertRuntimeConfig } from "./config/runtime-config.js";
import { requestContext } from "./http/request-context.js";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  assertRuntimeConfig(process.env);
  const app = await NestFactory.create(AppModule);
  app.use(requestContext);
  app.enableShutdownHooks();
  const webOrigin = process.env.WEB_ORIGIN?.trim();
  if (webOrigin && webOrigin !== "*") {
    app.enableCors({ origin: webOrigin, credentials: false });
  }
  const port = process.env.PORT ?? "3001";
  await app.listen(port);
}

void bootstrap();
