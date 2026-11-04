const regionPattern = /^[a-z]{2}-[a-z]+-\d+$/;
const clientIdPattern = /^[A-Za-z0-9]{20,128}$/;

export type CognitoAuthConfig = {
  region: string;
  userPoolId: string;
  clientId: string;
  issuer: string;
};

export class CognitoAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CognitoAuthConfigError";
  }
}

export function expectedCognitoIssuer(region: string, userPoolId: string): string {
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}

/**
 * Returns null when Cognito is not configured.
 * Throws when the configuration is partial or invalid.
 * Production must not call this and then continue with a null result.
 */
export function loadCognitoAuthConfig(
  env: Record<string, string | undefined>,
): CognitoAuthConfig | null {
  const region = env.COGNITO_REGION?.trim() ?? "";
  const userPoolId = env.COGNITO_USER_POOL_ID?.trim() ?? "";
  const clientId = env.COGNITO_CLIENT_ID?.trim() ?? "";
  const configuredIssuer = env.OIDC_ISSUER?.trim() ?? "";
  const present = [region, userPoolId, clientId].filter((value) => value.length > 0);

  if (present.length === 0 && configuredIssuer.length === 0) {
    return null;
  }
  if (present.length !== 3) {
    throw new CognitoAuthConfigError(
      "COGNITO_REGION, COGNITO_USER_POOL_ID, and COGNITO_CLIENT_ID must be set together.",
    );
  }
  if (!regionPattern.test(region)) {
    throw new CognitoAuthConfigError("COGNITO_REGION is not a valid AWS region.");
  }
  if (!userPoolId.startsWith(`${region}_`) || userPoolId.length <= region.length + 1) {
    throw new CognitoAuthConfigError("COGNITO_USER_POOL_ID does not match COGNITO_REGION.");
  }
  if (!clientIdPattern.test(clientId)) {
    throw new CognitoAuthConfigError("COGNITO_CLIENT_ID is invalid.");
  }

  const issuer = expectedCognitoIssuer(region, userPoolId);
  if (configuredIssuer.length > 0 && configuredIssuer !== issuer) {
    throw new CognitoAuthConfigError(
      "OIDC_ISSUER does not match the issuer derived from the Cognito region and user pool.",
    );
  }

  return { region, userPoolId, clientId, issuer };
}
