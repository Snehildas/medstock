import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import {
  CognitoJwtInvalidClientIdError,
  CognitoJwtInvalidTokenUseError,
  JwtExpiredError,
  JwtInvalidSignatureError,
  ParameterValidationError,
} from "aws-jwt-verify/error";
import type { Jwks } from "aws-jwt-verify/jwk";
import { loadCognitoAuthConfig } from "./cognito-auth.config.js";
import { CognitoIdentityVerifier, createCognitoAccessTokenChecker } from "./cognito-identity.verifier.js";
import { InvalidIdentityError, UnverifiedIdentityError } from "./domain-error.js";

const region = "ap-south-1";
const userPoolId = "ap-south-1_examplePool";
const clientId = "abcdefghijklmnopqrstuvwxyz";
const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
const config = loadCognitoAuthConfig({
  COGNITO_REGION: region,
  COGNITO_USER_POOL_ID: userPoolId,
  COGNITO_CLIENT_ID: clientId,
});

if (!config) {
  throw new Error("The fixture Cognito configuration is invalid.");
}

const signingKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = publicJwks(signingKey.publicKey);
const checker = createCognitoAccessTokenChecker(config, { jwks });
const verifier = new CognitoIdentityVerifier(checker);

describe("Cognito access token verification", () => {
  it("accepts a locally signed access token with a verified email", async () => {
    await expect(verifier.verify(signToken(signingKey.privateKey, claims()))).resolves.toMatchObject({
      subject: "subject-1",
      email: "person@example.test",
      emailVerified: true,
    });
  });

  it("rejects an invalid signature, the wrong issuer, the wrong client, the wrong token use, and an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const cases = [
      { token: signToken(otherKey.privateKey, claims()), error: JwtInvalidSignatureError },
      {
        token: signToken(
          signingKey.privateKey,
          claims({ iss: "https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_otherPool" }),
        ),
        error: ParameterValidationError,
      },
      { token: signToken(signingKey.privateKey, claims({ client_id: "wrongclientwrongclient" })), error: CognitoJwtInvalidClientIdError },
      { token: signToken(signingKey.privateKey, claims({ token_use: "id" })), error: CognitoJwtInvalidTokenUseError },
      { token: signToken(signingKey.privateKey, claims({ exp: now - 60, iat: now - 120 })), error: JwtExpiredError },
    ];
    for (const item of cases) {
      await expect(checker.verify(item.token)).rejects.toBeInstanceOf(item.error);
      await expect(verifier.verify(item.token)).rejects.toBeInstanceOf(InvalidIdentityError);
    }
  });

  it("rejects a missing email and an unverified email after the signature check", async () => {
    const { email: _email, ...withoutEmail } = claims();
    await expect(verifier.verify(signToken(signingKey.privateKey, withoutEmail))).rejects.toBeInstanceOf(
      InvalidIdentityError,
    );
    await expect(
      verifier.verify(signToken(signingKey.privateKey, claims({ email_verified: false }))),
    ).rejects.toBeInstanceOf(UnverifiedIdentityError);
  });
});

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "subject-1",
    token_use: "access",
    client_id: clientId,
    iss: issuer,
    iat: now,
    exp: now + 300,
    auth_time: now,
    email: "person@example.test",
    email_verified: true,
    ...overrides,
  };
}

function signToken(privateKey: KeyObject, payload: Record<string, unknown>): string {
  const encodedHeader = base64Url(JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

function publicJwks(publicKey: KeyObject): Jwks {
  const jwk = publicKey.export({ format: "jwk" }) as { n?: string; e?: string };
  if (!jwk.n || !jwk.e) {
    throw new Error("The test key did not export an RSA modulus.");
  }
  return {
    keys: [
      {
        kty: "RSA",
        kid: "test-key",
        alg: "RS256",
        use: "sig",
        n: jwk.n,
        e: jwk.e,
      },
    ],
  };
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}
