export const IMPORT_MAX_BYTES = 1_048_576;
export const IMPORT_MAX_ROWS = 500;

export const IMPORT_REQUIRED_HEADERS = [
  "indicative_unit_price",
  "currency",
  "minimum_order_quantity",
  "stock_status",
] as const;

export const IMPORT_HEADERS = [
  "medicine_name",
  "pack_id",
  "pack_description",
  "indicative_unit_price",
  "currency",
  "minimum_order_quantity",
  "stock_status",
  "available_quantity",
  "source_note",
] as const;

export function neutralizeSpreadsheetText(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}
