import { InvalidIdentityError } from "./domain-error.js";
import { StaticIdentityVerifier, type VerifiedIdentity } from "./identity-verifier.js";

const identity: VerifiedIdentity = {
  subject: "subject-1",
  email: "person@example.test",
  emailVerified: true,
  displayName: "Person",
};

describe("StaticIdentityVerifier", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDevMode = process.env.AUTH_DEV_MODE;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousDevMode === undefined) {
      delete process.env.AUTH_DEV_MODE;
    } else {
      process.env.AUTH_DEV_MODE = previousDevMode;
    }
  });

  it("rejects a token that was not issued to the test double", async () => {
    const verifier = new StaticIdentityVerifier("test-token-static-identity", identity);
    await expect(verifier.verify("different-token-value")).rejects.toBeInstanceOf(
      InvalidIdentityError,
    );
  });

  it("refuses to run in production even when AUTH_DEV_MODE is set", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_DEV_MODE = "true";
    expect(
      () => new StaticIdentityVerifier("test-token-static-identity", identity),
    ).toThrow("cannot run when NODE_ENV is production");
  });
});
