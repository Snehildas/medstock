import ExcelJS from "exceljs";
import { ImportFileRejectedError } from "../identity/domain-error.js";
import {
  IMPORT_HEADERS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_REQUIRED_HEADERS,
} from "./import-limits.js";
import { parseCsv } from "./parse-csv.js";

export type ImportTable = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

export async function readImportTable(fileName: string, bytes: Buffer): Promise<ImportTable> {
  if (bytes.length === 0) {
    throw new ImportFileRejectedError("The file is empty.");
  }
  if (bytes.length > IMPORT_MAX_BYTES) {
    throw new ImportFileRejectedError("The file exceeds the 1 MB limit.");
  }
  const format = fileFormat(fileName, bytes);
  const table = format === "csv" ? readCsv(bytes) : await readXlsx(bytes);
  if (table.length === 0) {
    throw new ImportFileRejectedError("The file has no header row.");
  }
  const headers = (table[0] ?? []).map((header) => header.trim().toLowerCase());
  const unknown = headers.filter(
    (header) => header.length > 0 && !IMPORT_HEADERS.includes(header as (typeof IMPORT_HEADERS)[number]),
  );
  if (unknown.length > 0) {
    throw new ImportFileRejectedError(`Unsupported column: ${unknown[0]}.`);
  }
  const missing = IMPORT_REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new ImportFileRejectedError(`Missing required column: ${missing[0]}.`);
  }
  const dataRows = table.slice(1).filter((record) => record.some((value) => value.trim().length > 0));
  if (dataRows.length === 0) {
    throw new ImportFileRejectedError("The file has no data rows.");
  }
  if (dataRows.length > IMPORT_MAX_ROWS) {
    throw new ImportFileRejectedError("The file exceeds the 500 row limit.");
  }
  return {
    headers,
    rows: dataRows.map((record) => {
      const mapped: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header.length > 0) {
          mapped[header] = (record[index] ?? "").trim();
        }
      });
      return mapped;
    }),
  };
}

function fileFormat(fileName: string, bytes: Buffer): "csv" | "xlsx" {
  const lower = fileName.trim().toLowerCase();
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (lower.endsWith(".csv")) {
    if (zip || bytes.includes(0)) {
      throw new ImportFileRejectedError("The CSV file is malformed.");
    }
    return "csv";
  }
  if (lower.endsWith(".xlsx")) {
    if (!zip) {
      throw new ImportFileRejectedError("The XLSX file is malformed.");
    }
    return "xlsx";
  }
  throw new ImportFileRejectedError("Only CSV and XLSX files are supported.");
}

function readCsv(bytes: Buffer): string[][] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ImportFileRejectedError("The CSV file is malformed.");
  }
  try {
    return parseCsv(text);
  } catch {
    throw new ImportFileRejectedError("The CSV file is malformed.");
  }
}

async function readXlsx(bytes: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new ImportFileRejectedError("The XLSX file is malformed or encrypted.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new ImportFileRejectedError("The XLSX file has no worksheet.");
  }
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values;
    const cells = Array.isArray(values) ? values.slice(1) : [];
    rows.push(cells.map((value) => cellText(value)));
  });
  return rows;
}

function cellText(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  if (typeof value === "object" && "result" in value) {
    return cellText(value.result);
  }
  return "";
}
