export function normalizeCatalogName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new Error("Catalog name is empty after normalization.");
  }
  return normalized;
}
