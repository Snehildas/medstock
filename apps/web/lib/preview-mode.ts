export const PREVIEW_ORGANIZATION_COOKIE = "medstock_preview_organization";

export function localPreviewAllowed(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV !== "production" && env.MEDSTOCK_LOCAL_PREVIEW === "true";
}

export function assertLocalPreviewDisabledInProduction(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === "production" && env.MEDSTOCK_LOCAL_PREVIEW === "true") {
    console.error("MEDSTOCK_LOCAL_PREVIEW is refused because NODE_ENV is production.");
    throw new Error("MEDSTOCK_LOCAL_PREVIEW cannot be enabled when NODE_ENV is production.");
  }
}
