import { classifyFreshness, LISTING_FRESH_WINDOW_MS } from "./freshness.js";

describe("listing freshness", () => {
  const now = new Date("2026-11-05T00:00:00.000Z");

  it("classifies a recent update as fresh and an older update as stale", () => {
    expect(classifyFreshness(new Date(now.getTime() - LISTING_FRESH_WINDOW_MS), now)).toBe("FRESH");
    expect(classifyFreshness(new Date(now.getTime() - LISTING_FRESH_WINDOW_MS - 1), now)).toBe(
      "STALE",
    );
  });

  it("classifies a missing timestamp as unknown", () => {
    expect(classifyFreshness(null, now)).toBe("UNKNOWN");
  });
});
