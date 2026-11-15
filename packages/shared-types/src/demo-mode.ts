const cognitoNames = [
  "COGNITO_REGION",
  "COGNITO_USER_POOL_ID",
  "COGNITO_CLIENT_ID",
  "COGNITO_DOMAIN",
  "COGNITO_CLIENT_SECRET",
  "OIDC_ISSUER",
] as const;

export function demoModeEnabled(env: Record<string, string | undefined>): boolean {
  return env.MEDSTOCK_DEMO_MODE === "true";
}

export function demoModeConflict(env: Record<string, string | undefined>): string | null {
  if (!demoModeEnabled(env)) {
    return null;
  }
  if (env.AUTH_DEV_MODE === "true") {
    return "MEDSTOCK_DEMO_MODE cannot be combined with AUTH_DEV_MODE.";
  }
  if (env.MEDSTOCK_LOCAL_PREVIEW === "true") {
    return "MEDSTOCK_DEMO_MODE cannot be combined with local preview.";
  }
  const cognitoConfigured = cognitoNames.some((name) => (env[name]?.trim() ?? "").length > 0);
  if (cognitoConfigured) {
    return "MEDSTOCK_DEMO_MODE cannot be combined with Cognito settings.";
  }
  return null;
}
