import { InvalidIdentityError } from "./domain-error.js";

export type VerifiedIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
};

export interface IdentityVerifier {
  verify(accessToken: string): Promise<VerifiedIdentity>;
}

export const IDENTITY_VERIFIER = Symbol("IDENTITY_VERIFIER");

export function assertDevIdentityAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "A development identity verifier cannot run when NODE_ENV is production.",
    );
  }
}

/**
 * Test double. It accepts one exact token and never checks a signature.
 * The constructor and verify() both refuse to run in production, including when
 * AUTH_DEV_MODE is set.
 */
export class StaticIdentityVerifier implements IdentityVerifier {
  constructor(
    private readonly acceptedToken: string,
    private readonly identity: VerifiedIdentity,
  ) {
    assertDevIdentityAllowed();
    if (acceptedToken.length < 20 || identity.subject.trim().length === 0) {
      throw new Error("Static identity verifier received an empty token or subject.");
    }
  }

  verify(accessToken: string): Promise<VerifiedIdentity> {
    assertDevIdentityAllowed();
    if (accessToken !== this.acceptedToken) {
      return Promise.reject(new InvalidIdentityError());
    }
    return Promise.resolve(this.identity);
  }
}
