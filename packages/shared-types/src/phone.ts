export function normalizeContactNumber(kind: "mobile" | "landline", raw: string): string | null {
  const compact = raw.trim().replace(/[\s().-]/g, "");
  if (compact.length === 0 || !/^\+?\d+$/.test(compact)) {
    return null;
  }
  let national = compact.startsWith("+") ? compact.slice(1) : compact;
  if (national.startsWith("91") && national.length > 10) {
    national = national.slice(2);
  } else if (national.startsWith("0")) {
    national = national.slice(1);
  }
  if (kind === "mobile") {
    return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
  }
  return /^[1-9]\d{7,10}$/.test(national) ? `+91${national}` : null;
}
