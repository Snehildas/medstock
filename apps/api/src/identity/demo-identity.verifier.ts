import { verifyDemoAccessToken } from "@medstock/shared-types";
import { InvalidIdentityError } from "./domain-error.js";
import type { IdentityVerifier, VerifiedIdentity } from "./identity-verifier.js";

export class DemoIdentityVerifier implements IdentityVerifier {
  constructor(private readonly secret: string) {}

  verify(accessToken: string): Promise<VerifiedIdentity> {
    const verified = verifyDemoAccessToken(accessToken, this.secret);
    if (!verified) {
      return Promise.reject(new InvalidIdentityError());
    }
    return Promise.resolve({
      subject: verified.subject,
      email: verified.email,
      emailVerified: true,
      displayName: verified.name,
    });
  }
}
