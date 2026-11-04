import { CognitoJwtVerifier } from "aws-jwt-verify";
import { InvalidIdentityError, UnverifiedIdentityError } from "./domain-error.js";
import type { IdentityVerifier, VerifiedIdentity } from "./identity-verifier.js";
import { loadCognitoAuthConfig, type CognitoAuthConfig } from "./cognito-auth.config.js";

export type AccessTokenClaims = {
  sub?: string;
  token_use?: string;
  client_id?: string;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
};

export interface AccessTokenChecker {
  verify(accessToken: string): Promise<AccessTokenClaims>;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UnconfiguredIdentityVerifier implements IdentityVerifier {
  verify(): Promise<VerifiedIdentity> {
    return Promise.reject(new InvalidIdentityError());
  }
}

export class CognitoIdentityVerifier implements IdentityVerifier {
  constructor(private readonly checker: AccessTokenChecker) {}

  async verify(accessToken: string): Promise<VerifiedIdentity> {
    let claims: AccessTokenClaims;
    try {
      claims = await this.checker.verify(accessToken);
    } catch {
      throw new InvalidIdentityError();
    }

    if (claims.token_use !== "access" || typeof claims.client_id !== "string") {
      throw new InvalidIdentityError();
    }
    if (typeof claims.sub !== "string" || claims.sub.trim().length === 0) {
      throw new InvalidIdentityError();
    }
    if (typeof claims.email !== "string" || !emailPattern.test(claims.email.trim())) {
      throw new InvalidIdentityError();
    }
    if (claims.email_verified !== true && claims.email_verified !== "true") {
      throw new UnverifiedIdentityError();
    }

    const displayName =
      typeof claims.name === "string" && claims.name.trim().length > 0 ? claims.name.trim() : null;

    return {
      subject: claims.sub,
      email: claims.email,
      emailVerified: true,
      displayName,
    };
  }
}

export function createCognitoAccessTokenChecker(config: CognitoAuthConfig): AccessTokenChecker {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    tokenUse: "access",
    clientId: config.clientId,
  });
  return {
    async verify(accessToken: string): Promise<AccessTokenClaims> {
      const payload = await verifier.verify(accessToken);
      const claims = payload as AccessTokenClaims & typeof payload;
      return {
        sub: claims.sub,
        token_use: claims.token_use,
        client_id: claims.client_id,
        email: claims.email,
        email_verified: claims.email_verified,
        name: claims.name,
      };
    },
  };
}

export function createIdentityVerifier(
  env: Record<string, string | undefined>,
): IdentityVerifier {
  const config = loadCognitoAuthConfig(env);
  if (!config) {
    if (env.NODE_ENV === "production") {
      throw new Error("Cognito authentication configuration is required when NODE_ENV is production.");
    }
    return new UnconfiguredIdentityVerifier();
  }
  return new CognitoIdentityVerifier(createCognitoAccessTokenChecker(config));
}
