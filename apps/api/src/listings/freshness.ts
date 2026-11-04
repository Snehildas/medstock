export const LISTING_FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ListingFreshness = "FRESH" | "STALE" | "UNKNOWN";

export function classifyFreshness(updatedAt: Date | null, now: Date): ListingFreshness {
  if (!updatedAt) {
    return "UNKNOWN";
  }
  const age = now.getTime() - updatedAt.getTime();
  return age <= LISTING_FRESH_WINDOW_MS ? "FRESH" : "STALE";
}
