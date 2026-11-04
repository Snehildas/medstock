export function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

export function formatDecimal(value: { toString(): string }): string {
  const raw = value.toString();
  if (!raw.includes(".")) {
    return raw;
  }
  const trimmed = raw.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed.length === 0 ? "0" : trimmed;
}
