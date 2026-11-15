import { assertRuntimeConfig, RuntimeConfigError } from "./runtime-config.js";

describe("production runtime configuration", () => {
  it("rejects a production process without https WEB_ORIGIN or with AUTH_DEV_MODE", () => {
    expect(() =>
      assertRuntimeConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://medstock:medstock@localhost:5432/medstock",
        AUTH_DEV_MODE: "true",
        WEB_ORIGIN: "https://staging.example.com",
      }),
    ).toThrow(RuntimeConfigError);
    expect(() =>
      assertRuntimeConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://medstock:medstock@localhost:5432/medstock",
        WEB_ORIGIN: "*",
      }),
    ).toThrow("one https origin");
    expect(() =>
      assertRuntimeConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://medstock:medstock@localhost:5432/medstock",
        WEB_ORIGIN: "http://staging.example.com",
      }),
    ).toThrow("one https origin");
  });

  it("requires a Neon demo database when demo mode is enabled and leaves Cognito required otherwise", () => {
    expect(() =>
      assertRuntimeConfig({
        NODE_ENV: "production",
        MEDSTOCK_DEMO_MODE: "true",
        DATABASE_URL: "postgresql://medstock:medstock@localhost:5433/medstock",
        WEB_ORIGIN: "https://medstock-demo-web.onrender.com",
        MEDSTOCK_DEMO_TOKEN_SECRET: "demo-token-secret-with-32-characters",
      }),
    ).toThrow(/local database/);
    expect(() =>
      assertRuntimeConfig({
        NODE_ENV: "production",
        MEDSTOCK_DEMO_MODE: "true",
        DATABASE_URL: "postgresql://demo:secret@ep-example-pooler.ap-southeast-1.aws.neon.tech/medstock_demo?sslmode=require",
        WEB_ORIGIN: "https://medstock-demo-web.onrender.com",
        MEDSTOCK_DEMO_TOKEN_SECRET: "demo-token-secret-with-32-characters",
      }),
    ).not.toThrow();
    expect(() =>
      assertRuntimeConfig({
        NODE_ENV: "production",
        MEDSTOCK_DEMO_MODE: "true",
        DATABASE_URL: "postgresql://demo:secret@ep-example-pooler.ap-southeast-1.aws.neon.tech/medstock_demo?sslmode=require",
        WEB_ORIGIN: "https://medstock-demo-web.onrender.com",
        MEDSTOCK_DEMO_TOKEN_SECRET: "demo-token-secret-with-32-characters",
        COGNITO_REGION: "ap-south-1",
      }),
    ).toThrow(/Cognito/);
  });

  it("accepts a production https origin and does not require it outside production", () => {
    expect(() =>
      assertRuntimeConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://medstock:medstock@localhost:5432/medstock",
        WEB_ORIGIN: "https://staging.example.com",
      }),
    ).not.toThrow();
    expect(() =>
      assertRuntimeConfig({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://medstock:medstock@localhost:5432/medstock",
      }),
    ).not.toThrow();
  });
});
