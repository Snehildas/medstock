export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error("Email is empty after normalization.");
  }
  return normalized;
}
