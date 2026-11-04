import { CognitoAuthConfigError, loadCognitoAuthConfig } from "./cognito-auth.config.js";
import {
  CognitoIdentityVerifier,
  UnconfiguredIdentityVerifier,
  createIdentityVerifier,
} from "./cognito-identity.verifier.js";
import { InvalidIdentityError, UnverifiedIdentityError } from "./domain-error.js";

const validEnv = {
  COGNITO_REGION: "ap-south-1",
  COGNITO_USER_POOL_ID: "ap-south-1_examplePool",
  COGNITO_CLIENT_ID: "abcdefghijklmnopqrstuvwxyz",
};

describe("Cognito auth configuration", () => {
  it("leaves authentication unconfigured outside production when no Cognito values are set", () => {
    expect(loadCognitoAuthConfig({ NODE_ENV: "test" })).toBeNull();
    expect(createIdentityVerifier({ NODE_ENV: "test" })).toBeInstanceOf(
      UnconfiguredIdentityVerifier,
    );
  });

  it("fails production startup when Cognito is not configured", () => {
    expect(() => createIdentityVerifier({ NODE_ENV: "production" })).toThrow(
      "required when NODE_ENV is production",
    );
  });

  it("rejects a partial or mismatched configuration", () => {
    expect(() => loadCognitoAuthConfig({ COGNITO_REGION: "ap-south-1" })).toThrow(
      CognitoAuthConfigError,
    );
    expect(() =>
      loadCognitoAuthConfig({
        ...validEnv,
        OIDC_ISSUER: "https://evil.example/pool",
      }),
    ).toThrow(CognitoAuthConfigError);
  });

  it("derives the issuer and accepts an explicit issuer that matches it", () => {
    const config = loadCognitoAuthConfig({
      ...validEnv,
      OIDC_ISSUER: "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_examplePool",
    });
    expect(config?.issuer).toBe(
      "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_examplePool",
    );
    expect(config?.clientId).toBe(validEnv.COGNITO_CLIENT_ID);
  });
});

describe("CognitoIdentityVerifier claim checks", () => {
  const verifier = new CognitoIdentityVerifier({
    verify: async () => ({
      sub: "cognito-subject",
      token_use: "access",
      client_id: validEnv.COGNITO_CLIENT_ID,
      email: " Person@Example.test ",
      email_verified: true,
      name: "Person",
    }),
  });

  it("returns only the verified identity fields", async () => {
    await expect(verifier.verify("signed-token")).resolves.toEqual({
      subject: "cognito-subject",
      email: " Person@Example.test ",
      emailVerified: true,
      displayName: "Person",
    });
  });

  it("rejects an access token that is missing an email", async () => {
    const missingEmail = new CognitoIdentityVerifier({
      verify: async () => ({
        sub: "cognito-subject",
        token_use: "access",
        client_id: validEnv.COGNITO_CLIENT_ID,
        email_verified: true,
      }),
    });
    await expect(missingEmail.verify("signed-token")).rejects.toBeInstanceOf(InvalidIdentityError);
  });

  it("rejects an unverified email and a failed signature check", async () => {
    const unverified = new CognitoIdentityVerifier({
      verify: async () => ({
        sub: "cognito-subject",
        token_use: "access",
        client_id: validEnv.COGNITO_CLIENT_ID,
        email: "person@example.test",
        email_verified: false,
      }),
    });
    await expect(unverified.verify("signed-token")).rejects.toBeInstanceOf(UnverifiedIdentityError);

    const invalidSignature = new CognitoIdentityVerifier({
      verify: async () => {
        throw new Error("signature");
      },
    });
    await expect(invalidSignature.verify("bad-token")).rejects.toBeInstanceOf(InvalidIdentityError);
  });

  it("rejects an ID token presented as an access token", async () => {
    const idToken = new CognitoIdentityVerifier({
      verify: async () => ({
        sub: "cognito-subject",
        token_use: "id",
        client_id: validEnv.COGNITO_CLIENT_ID,
        email: "person@example.test",
        email_verified: true,
      }),
    });
    await expect(idToken.verify("id-token")).rejects.toBeInstanceOf(InvalidIdentityError);
  });
});