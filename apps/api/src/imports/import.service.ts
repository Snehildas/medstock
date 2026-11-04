import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  CatalogStatus,
  ListingCurrency,
  ListingImportAction,
  ListingImportOutcome,
  ListingImportStatus,
  ListingSource,
  ListingStatus,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  Prisma,
  StockStatus,
  PrismaClient,
  normalizeCatalogName,
} from "@medstock/database";
import { listingImportPageSchema, listingImportSchema, type ListingImportPage, type ListingImportResponse } from "@medstock/shared-types";
import {
  ImportForbiddenError,
  ImportNotFoundError,
  InvalidImportTransitionError,
  OrganizationIneligibleError,
  OrganizationNotDistributorError,
} from "../identity/domain-error.js";
import { neutralizeSpreadsheetText } from "./import-limits.js";
import { readImportTable } from "./read-import-file.js";

const managerRoles = new Set(["DISTRIBUTOR_OWNER", "DISTRIBUTOR_STAFF"]);
const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const wholeNumberPattern = /^(?:0|[1-9]\d*)$/;

type ImportWithRows = Prisma.ListingImportGetPayload<{ include: { rows: true } }>;
type ImportRow = ImportWithRows["rows"][number];
type StagedRow = {
  rowNumber: number;
  medicineName: string | null;
  packIdText: string | null;
  packDescription: string | null;
  indicativeUnitPrice: string | null;
  currency: string | null;
  minimumOrderQuantity: string | null;
  stockStatus: string | null;
  availableQuantity: string | null;
  availableQuantityProvided: boolean;
  sourceNote: string | null;
  sourceNoteProvided: boolean;
  matchedPackId: string | null;
  existingListingId: string | null;
  action: ListingImportAction | null;
  errors: string[];
  warnings: string[];
};

type CatalogPack = {
  id: string;
  description: string;
  normalizedDescription: string;
  medicineName: string;
  normalizedMedicineName: string;
  eligible: boolean;
  listings: Array<{ id: string; organizationId: string; status: ListingStatus }>;
};

type ApplyResult = "created" | "updated" | "skipped" | "failed";

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaClient) {}

  async createPreview(
    actorUserId: string,
    organizationId: string,
    file: { fileName: string; bytes: Buffer },
  ): Promise<ListingImportResponse> {
    await this.requireManager(this.prisma, actorUserId, organizationId);
    const table = await readImportTable(file.fileName, file.bytes);
    const checksum = createHash("sha256").update(file.bytes).digest("hex");
    const existing = await this.prisma.listingImport.findFirst({
      where: { organizationId, checksum, status: ListingImportStatus.PREVIEW_READY },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    if (existing) {
      return this.toResponse(existing);
    }
    const catalog = await this.loadCatalog();
    const staged = this.stageRows(organizationId, table.rows, catalog);
    const validRows = staged.filter((row) => row.errors.length === 0).length;
    const created = await this.prisma.listingImport.create({
      data: {
        organizationId,
        uploadedByUserId: actorUserId,
        fileName: safeFileName(file.fileName),
        checksum,
        byteSize: file.bytes.length,
        status: ListingImportStatus.PREVIEW_READY,
        totalRows: staged.length,
        validRows,
        invalidRows: staged.length - validRows,
        rows: { create: staged },
      },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    return this.toResponse(created);
  }

  async list(
    actorUserId: string,
    organizationId: string,
    page: number,
    pageSize: number,
  ): Promise<ListingImportPage> {
    await this.requireManager(this.prisma, actorUserId, organizationId);
    const where = { organizationId };
    const records = await this.prisma.listingImport.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await this.prisma.listingImport.count({ where });
    return listingImportPageSchema.parse({
      page,
      pageSize,
      total,
      items: records.map((record) => ({
        id: record.id,
        organizationId: record.organizationId,
        status: record.status,
        fileName: record.fileName,
        totalRows: record.totalRows,
        validRows: record.validRows,
        invalidRows: record.invalidRows,
        createdRows: record.createdRows,
        updatedRows: record.updatedRows,
        skippedRows: record.skippedRows,
        failedRows: record.failedRows,
        createdAt: record.createdAt.toISOString(),
        completedAt: record.completedAt?.toISOString() ?? null,
      })),
    });
  }

  async get(actorUserId: string, importId: string): Promise<ListingImportResponse> {
    const record = await this.prisma.listingImport.findUnique({
      where: { id: importId },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    if (!record || !(await this.isManager(this.prisma, actorUserId, record.organizationId))) {
      throw new ImportNotFoundError();
    }
    return this.toResponse(record);
  }

  async getForAdmin(actorUserId: string, importId: string): Promise<ListingImportResponse> {
    await this.requirePlatformAdmin(actorUserId);
    const record = await this.prisma.listingImport.findUnique({
      where: { id: importId },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    if (!record) {
      throw new ImportNotFoundError();
    }
    console.info(
      JSON.stringify({
        event: "import.admin_read",
        actorUserId,
        importId,
        organizationId: record.organizationId,
      }),
    );
    return this.toResponse(record);
  }

  async commit(actorUserId: string, importId: string): Promise<ListingImportResponse> {
    const committed = await this.prisma.$transaction((tx) => this.commitInTransaction(tx, actorUserId, importId));
    return this.toResponse(committed);
  }

  async cancel(actorUserId: string, importId: string): Promise<ListingImportResponse> {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const record = await tx.listingImport.findUnique({
        where: { id: importId },
        include: { rows: { orderBy: { rowNumber: "asc" } } },
      });
      if (!record || !(await this.isManager(tx, actorUserId, record.organizationId))) {
        throw new ImportNotFoundError();
      }
      if (record.status !== ListingImportStatus.PREVIEW_READY) {
        throw new InvalidImportTransitionError();
      }
      const claimed = await tx.listingImport.updateMany({
        where: { id: importId, status: ListingImportStatus.PREVIEW_READY },
        data: { status: ListingImportStatus.CANCELLED, completedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new InvalidImportTransitionError();
      }
      await tx.listingImportAuditEvent.create({
        data: {
          actorUserId,
          organizationId: record.organizationId,
          importId,
          action: "import.cancel",
        },
      });
      return tx.listingImport.findUniqueOrThrow({
        where: { id: importId },
        include: { rows: { orderBy: { rowNumber: "asc" } } },
      });
    });
    return this.toResponse(cancelled);
  }

  private async commitInTransaction(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    importId: string,
  ): Promise<ImportWithRows> {
    const record = await tx.listingImport.findUnique({
      where: { id: importId },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    if (!record || !(await this.isManager(tx, actorUserId, record.organizationId))) {
      throw new ImportNotFoundError();
    }
    if (record.status === ListingImportStatus.COMMITTED) {
      return record;
    }
    if (record.status !== ListingImportStatus.PREVIEW_READY) {
      throw new InvalidImportTransitionError();
    }
    const claimed = await tx.listingImport.updateMany({
      where: { id: importId, status: ListingImportStatus.PREVIEW_READY },
      data: { status: ListingImportStatus.COMMITTED, completedAt: new Date() },
    });
    if (claimed.count !== 1) {
      const current = await tx.listingImport.findUnique({
        where: { id: importId },
        include: { rows: { orderBy: { rowNumber: "asc" } } },
      });
      if (current?.status === ListingImportStatus.COMMITTED) {
        return current;
      }
      throw new InvalidImportTransitionError();
    }
    let createdRows = 0;
    let updatedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;
    for (const row of record.rows) {
      const outcome = await this.applyRow(tx, actorUserId, record.organizationId, importId, row);
      if (outcome === "created") {
        createdRows += 1;
      } else if (outcome === "updated") {
        updatedRows += 1;
      } else if (outcome === "skipped") {
        skippedRows += 1;
      } else {
        failedRows += 1;
      }
    }
    await tx.listingImport.update({
      where: { id: importId },
      data: { createdRows, updatedRows, skippedRows, failedRows },
    });
    await tx.listingImportAuditEvent.create({
      data: {
        actorUserId,
        organizationId: record.organizationId,
        importId,
        action: "import.commit",
      },
    });
    return tx.listingImport.findUniqueOrThrow({
      where: { id: importId },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
  }

  private async applyRow(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    organizationId: string,
    importId: string,
    row: ImportRow,
  ): Promise<ApplyResult> {
    if (row.errors.length > 0 || row.matchedPackId == null || row.action == null) {
      await tx.listingImportRow.update({
        where: { id: row.id },
        data: { outcome: ListingImportOutcome.SKIPPED },
      });
      return "skipped";
    }
    const pack = await tx.medicinePack.findUnique({
      where: { id: row.matchedPackId },
      include: { medicine: true },
    });
    if (
      !pack ||
      pack.medicine.status !== CatalogStatus.PUBLISHED ||
      !pack.medicine.searchVisible
    ) {
      await this.failRow(tx, row.id, "The matched pack is no longer eligible for listing.");
      return "failed";
    }
    const parsed = parseStoredRow(row);
    if (!parsed) {
      await this.failRow(tx, row.id, "The staged row failed validation during commit.");
      return "failed";
    }
    const listing = await tx.distributorListing.findUnique({
      where: {
        organizationId_medicinePackId: {
          organizationId,
          medicinePackId: pack.id,
        },
      },
    });
    if (listing && listing.status !== ListingStatus.ACTIVE) {
      await this.failRow(tx, row.id, "Paused, archived, and suspended listings are not changed by import.");
      return "failed";
    }
    const now = new Date();
    if (!listing) {
      const savepoint = `import_row_${row.rowNumber}`;
      await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
      try {
        const created = await tx.distributorListing.create({
          data: {
            organizationId,
            medicinePackId: pack.id,
            unitPrice: parsed.unitPrice,
            currency: ListingCurrency.INR,
            minimumOrderQuantity: parsed.minimumOrderQuantity,
            stockStatus: parsed.stockStatus,
            availableQuantity: parsed.availableQuantity,
            sourceNote: parsed.sourceNote,
            source: ListingSource.CSV_IMPORT,
            status: ListingStatus.ACTIVE,
            priceUpdatedAt: now,
            stockUpdatedAt: now,
          },
        });
        await tx.listingAuditEvent.create({
          data: {
            actorUserId,
            organizationId,
            listingId: created.id,
            action: "listing.import_create",
            importId,
          },
        });
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (error) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          await this.failRow(tx, row.id, "A listing for this pack already exists.");
          return "failed";
        }
        throw error;
      }
      await tx.listingImportRow.update({
        where: { id: row.id },
        data: { outcome: ListingImportOutcome.APPLIED, action: ListingImportAction.CREATE },
      });
      return "created";
    }
    const changes = listingChanges(listing, parsed, now);
    if (Object.keys(changes).length === 0) {
      await tx.listingImportRow.update({
        where: { id: row.id },
        data: { outcome: ListingImportOutcome.SKIPPED, action: ListingImportAction.UPDATE },
      });
      return "skipped";
    }
    await tx.distributorListing.update({
      where: { id: listing.id },
      data: changes,
    });
    await tx.listingAuditEvent.create({
      data: {
        actorUserId,
        organizationId,
        listingId: listing.id,
        action: "listing.import_update",
        importId,
      },
    });
    await tx.listingImportRow.update({
      where: { id: row.id },
      data: { outcome: ListingImportOutcome.APPLIED, action: ListingImportAction.UPDATE },
    });
    return "updated";
  }

  private async failRow(tx: Prisma.TransactionClient, rowId: string, message: string): Promise<void> {
    const row = await tx.listingImportRow.findUniqueOrThrow({ where: { id: rowId } });
    await tx.listingImportRow.update({
      where: { id: rowId },
      data: {
        outcome: ListingImportOutcome.FAILED,
        errors: [...row.errors, message],
      },
    });
  }

  private stageRows(
    organizationId: string,
    rows: Array<Record<string, string>>,
    catalog: CatalogPack[],
  ): StagedRow[] {
    const staged = rows.map((cells, index) => this.stageRow(organizationId, index + 2, cells, catalog));
    const byPack = new Map<string, number[]>();
    staged.forEach((row, index) => {
      if (typeof row.matchedPackId === "string") {
        const matches = byPack.get(row.matchedPackId) ?? [];
        matches.push(index);
        byPack.set(row.matchedPackId, matches);
      }
    });
    for (const indexes of byPack.values()) {
      if (indexes.length < 2) {
        continue;
      }
      for (const index of indexes) {
        const row = staged[index];
        if (!row) {
          continue;
        }
        row.errors = [...row.errors, "This pack appears more than once in the file."];
        row.action = null;
        row.existingListingId = null;
      }
    }
    return staged;
  }

  private stageRow(
    organizationId: string,
    rowNumber: number,
    cells: Record<string, string>,
    catalog: CatalogPack[],
  ): StagedRow {
    const errors: string[] = [];
    const warnings: string[] = [];
    const medicineName = optional(cells["medicine_name"]);
    const packIdText = optional(cells["pack_id"]);
    const packDescription = optional(cells["pack_description"]);
    const priceText = cells["indicative_unit_price"] ?? "";
    const currencyText = (cells["currency"] ?? "").trim();
    const moqText = cells["minimum_order_quantity"] ?? "";
    const stockText = (cells["stock_status"] ?? "").trim().toUpperCase();
    const quantityProvided = Object.prototype.hasOwnProperty.call(cells, "available_quantity")
      && (cells["available_quantity"] ?? "").length > 0;
    const quantityText = quantityProvided ? cells["available_quantity"] ?? "" : null;
    const noteProvided = Object.prototype.hasOwnProperty.call(cells, "source_note")
      && (cells["source_note"] ?? "").length > 0;
    const noteText = noteProvided ? cells["source_note"] ?? "" : null;

    if (!moneyPattern.test(priceText)) {
      errors.push("indicative_unit_price must be a nonnegative amount with at most two decimal places.");
    }
    if (currencyText.toUpperCase() !== "INR") {
      errors.push("currency must be INR.");
    }
    if (!wholeNumberPattern.test(moqText) || moqText === "0") {
      errors.push("minimum_order_quantity must be a positive whole number.");
    }
    if (!Object.values(StockStatus).includes(stockText as StockStatus)) {
      errors.push("stock_status is not supported.");
    }
    if (quantityProvided && !wholeNumberPattern.test(quantityText ?? "")) {
      errors.push("available_quantity must be a nonnegative whole number.");
    }
    if (noteProvided && (noteText?.length ?? 0) > 200) {
      errors.push("source_note must be 200 characters or fewer.");
    }

    const match = matchPack(packIdText, medicineName, packDescription, catalog);
    errors.push(...match.errors);
    warnings.push(...match.warnings);
    const listing = match.pack?.listings.find((candidate) => candidate.organizationId === organizationId);
    if (match.pack && listing && listing.status !== ListingStatus.ACTIVE) {
      errors.push("Paused, archived, and suspended listings are not changed by import.");
    }
    const action = errors.length > 0 || !match.pack
      ? null
      : listing
        ? ListingImportAction.UPDATE
        : ListingImportAction.CREATE;

    return {
      rowNumber,
      medicineName,
      packIdText,
      packDescription,
      indicativeUnitPrice: priceText || null,
      currency: currencyText || null,
      minimumOrderQuantity: moqText || null,
      stockStatus: stockText || null,
      availableQuantity: quantityText,
      availableQuantityProvided: quantityProvided,
      sourceNote: noteText,
      sourceNoteProvided: noteProvided,
      matchedPackId: match.pack?.id ?? null,
      existingListingId: listing && listing.status === ListingStatus.ACTIVE ? listing.id : null,
      action,
      errors,
      warnings,
    };
  }

  private async loadCatalog(): Promise<CatalogPack[]> {
    const packs = await this.prisma.medicinePack.findMany({
      include: {
        medicine: true,
        listings: { select: { id: true, organizationId: true, status: true } },
      },
    });
    return packs.map((pack) => ({
      id: pack.id,
      description: pack.description,
      normalizedDescription: normalizeCatalogName(pack.description),
      medicineName: pack.medicine.displayName,
      normalizedMedicineName: pack.medicine.normalizedDisplayName,
      eligible: pack.medicine.status === CatalogStatus.PUBLISHED && pack.medicine.searchVisible,
      listings: pack.listings,
    }));
  }

  private async toResponse(record: ImportWithRows): Promise<ListingImportResponse> {
    const packIds = record.rows.flatMap((row) => (row.matchedPackId ? [row.matchedPackId] : []));
    const packs = packIds.length === 0
      ? []
      : await this.prisma.medicinePack.findMany({
          where: { id: { in: packIds } },
          include: { medicine: true },
        });
    const byId = new Map(packs.map((pack) => [pack.id, pack]));
    return listingImportSchema.parse({
      id: record.id,
      organizationId: record.organizationId,
      status: record.status,
      fileName: record.fileName,
      checksum: record.checksum,
      byteSize: record.byteSize,
      totalRows: record.totalRows,
      validRows: record.validRows,
      invalidRows: record.invalidRows,
      createdRows: record.createdRows,
      updatedRows: record.updatedRows,
      skippedRows: record.skippedRows,
      failedRows: record.failedRows,
      createdAt: record.createdAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
      rows: record.rows.map((row) => {
        const pack = row.matchedPackId ? byId.get(row.matchedPackId) : undefined;
        return {
          rowNumber: row.rowNumber,
          medicineName: display(row.medicineName),
          packDescription: display(row.packDescription),
          packId: display(row.packIdText),
          matchedPackId: row.matchedPackId,
          matchedMedicineName: pack ? pack.medicine.displayName : null,
          matchedPackDescription: pack ? pack.description : null,
          indicativeUnitPrice: display(row.indicativeUnitPrice),
          currency: display(row.currency),
          minimumOrderQuantity: display(row.minimumOrderQuantity),
          stockStatus: display(row.stockStatus),
          availableQuantity: display(row.availableQuantity),
          sourceNote: display(row.sourceNote),
          action: row.action,
          errors: row.errors,
          warnings: row.warnings,
          outcome: row.outcome,
        };
      }),
    });
  }

  private async requireManager(
    db: PrismaClient | Prisma.TransactionClient,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    if (!(await this.isManager(db, actorUserId, organizationId))) {
      const organization = await db.organization.findUnique({ where: { id: organizationId } });
      if (!organization || organization.type !== OrganizationType.DISTRIBUTOR) {
        throw new OrganizationNotDistributorError();
      }
      throw new ImportForbiddenError();
    }
  }

  private async isManager(
    db: PrismaClient | Prisma.TransactionClient,
    actorUserId: string,
    organizationId: string,
  ): Promise<boolean> {
    const organization = await db.organization.findUnique({ where: { id: organizationId } });
    if (!organization || organization.type !== OrganizationType.DISTRIBUTOR) {
      return false;
    }
    const membership = await db.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: actorUserId, organizationId } },
    });
    const member = Boolean(
      membership &&
        membership.status === MembershipStatus.ACTIVE &&
        managerRoles.has(membership.role),
    );
    if (!member) {
      return false;
    }
    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new OrganizationIneligibleError();
    }
    return true;
  }

  private async requirePlatformAdmin(actorUserId: string): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actorUserId,
        role: "PLATFORM_ADMIN",
        status: MembershipStatus.ACTIVE,
        organization: { type: OrganizationType.PLATFORM, status: OrganizationStatus.ACTIVE },
      },
    });
    if (!membership) {
      throw new ImportForbiddenError();
    }
  }
}

function matchPack(
  packIdText: string | null,
  medicineName: string | null,
  packDescription: string | null,
  catalog: CatalogPack[],
): { pack?: CatalogPack; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (packIdText) {
    const pack = catalog.find((candidate) => candidate.id === packIdText);
    if (!pack) {
      errors.push("pack_id does not match a canonical pack.");
      return { errors, warnings };
    }
    if (!pack.eligible) {
      errors.push("The pack is not eligible for distributor listing.");
    }
    if (medicineName && normalizeSafe(medicineName) !== pack.normalizedMedicineName) {
      warnings.push("medicine_name does not match the canonical pack and was ignored.");
    }
    if (packDescription && normalizeSafe(packDescription) !== pack.normalizedDescription) {
      warnings.push("pack_description does not match the canonical pack and was ignored.");
    }
    return { pack, errors, warnings };
  }
  const named = medicineName ? catalog.filter((pack) => pack.normalizedMedicineName === normalizeSafe(medicineName)) : catalog;
  const described = packDescription
    ? named.filter((pack) => pack.normalizedDescription === normalizeSafe(packDescription))
    : named;
  if (!medicineName && !packDescription) {
    errors.push("Provide pack_id or an unambiguous medicine name and pack description.");
    return { errors, warnings };
  }
  if (described.length !== 1) {
    errors.push(described.length === 0
      ? "No canonical pack matches this row."
      : "More than one canonical pack matches this row.");
    return { errors, warnings };
  }
  const pack = described[0];
  if (!pack) {
    errors.push("No canonical pack matches this row.");
    return { errors, warnings };
  }
  if (!pack.eligible) {
    errors.push("The pack is not eligible for distributor listing.");
  }
  return { pack, errors, warnings };
}

function normalizeSafe(value: string): string {
  try {
    return normalizeCatalogName(value);
  } catch {
    return "";
  }
}

type ParsedRow = {
  unitPrice: string;
  minimumOrderQuantity: string;
  stockStatus: StockStatus;
  availableQuantity: string | null;
  sourceNote: string | null;
};

function parseStoredRow(row: ImportRow): ParsedRow | null {
  if (
    !row.indicativeUnitPrice ||
    !moneyPattern.test(row.indicativeUnitPrice) ||
    !row.minimumOrderQuantity ||
    !wholeNumberPattern.test(row.minimumOrderQuantity) ||
    row.minimumOrderQuantity === "0" ||
    !row.stockStatus ||
    !Object.values(StockStatus).includes(row.stockStatus as StockStatus)
  ) {
    return null;
  }
  if (row.availableQuantityProvided && !wholeNumberPattern.test(row.availableQuantity ?? "")) {
    return null;
  }
  return {
    unitPrice: row.indicativeUnitPrice,
    minimumOrderQuantity: row.minimumOrderQuantity,
    stockStatus: row.stockStatus as StockStatus,
    availableQuantity: row.availableQuantityProvided ? row.availableQuantity : null,
    sourceNote: row.sourceNoteProvided ? row.sourceNote : null,
  };
}

function listingChanges(
  listing: {
    unitPrice: Prisma.Decimal;
    minimumOrderQuantity: Prisma.Decimal;
    stockStatus: StockStatus;
    availableQuantity: Prisma.Decimal | null;
    sourceNote: string | null;
    source: ListingSource;
  },
  parsed: ParsedRow,
  now: Date,
): Prisma.DistributorListingUpdateInput {
  const data: Prisma.DistributorListingUpdateInput = {};
  if (!sameDecimal(listing.unitPrice, parsed.unitPrice)) {
    data.unitPrice = parsed.unitPrice;
    data.priceUpdatedAt = now;
  }
  if (!sameDecimal(listing.minimumOrderQuantity, parsed.minimumOrderQuantity)) {
    data.minimumOrderQuantity = parsed.minimumOrderQuantity;
  }
  let stockChanged = false;
  if (listing.stockStatus !== parsed.stockStatus) {
    data.stockStatus = parsed.stockStatus;
    stockChanged = true;
  }
  if (parsed.availableQuantity != null && !sameDecimal(listing.availableQuantity, parsed.availableQuantity)) {
    data.availableQuantity = parsed.availableQuantity;
    stockChanged = true;
  }
  if (stockChanged) {
    data.stockUpdatedAt = now;
  }
  if (parsed.sourceNote != null && parsed.sourceNote !== listing.sourceNote) {
    data.sourceNote = parsed.sourceNote;
  }
  if (listing.source !== ListingSource.CSV_IMPORT && Object.keys(data).length > 0) {
    data.source = ListingSource.CSV_IMPORT;
  }
  return data;
}

function sameDecimal(left: { toString(): string } | null, right: string): boolean {
  if (left == null) {
    return false;
  }
  return Number(left.toString()) === Number(right);
}

function optional(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

function display(value: string | null): string | null {
  return value == null ? null : neutralizeSpreadsheetText(value);
}

function safeFileName(fileName: string): string {
  const trimmed = fileName.trim().slice(0, 200);
  return trimmed.length > 0 ? trimmed : "import.csv";
}

// The catalog loader attaches listings for the requesting organization only.