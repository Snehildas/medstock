import { Injectable } from "@nestjs/common";
import {
  CatalogStatus,
  IngredientKind,
  ListingStatus,
  MedicineCompanyRole,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  PackUnit,
  Prisma,
  PrismaClient,
  StrengthUnit,
  normalizeCatalogName,
} from "@medstock/database";
import type {
  CreateIngredientRequest,
  CreateManufacturerRequest,
  CreateMedicineRequest,
  MedicinePage,
  PublishMedicineRequest,
  ReplaceCompositionRequest,
  ReplaceManufacturersRequest,
  ReplacePacksRequest,
  UpdateIngredientRequest,
  UpdateManufacturerRequest,
  UpdateMedicineRequest,
} from "@medstock/shared-types";
import {
  CatalogDraftRequiredError,
  CatalogForbiddenError,
  DuplicateCatalogRecordError,
  IngredientNotFoundError,
  InvalidCatalogTransitionError,
  ManufacturerNotFoundError,
  MedicineNotFoundError,
} from "../identity/domain-error.js";
import { prismaErrorCode } from "../identity/prisma-error.js";
import { buildSearchText } from "./search-text.js";

type Tx = Prisma.TransactionClient;

export type SubmittedMedicineInput = {
  submissionId: string;
  displayName: string;
  brandName: string | null;
  genericName: string | null;
  dosageForm: string;
  presentation: string | null;
  manufacturerName: string | null;
  marketerName: string | null;
  ingredients: Array<{
    ingredientName: string;
    kind: "ACTIVE" | "SALT";
    strengthValue: string;
    strengthUnit: "MG" | "MCG" | "G" | "ML" | "IU" | "PERCENT";
    basis: string | null;
    sequence: number;
  }>;
  packs: Array<{
    description: string;
    quantity: string;
    unit: "TABLET" | "CAPSULE" | "ML" | "G" | "VIAL" | "BOTTLE" | "PIECE";
  }>;
};

const medicineInclude = {
  compositions: {
    include: { ingredient: true },
    orderBy: { sequence: "asc" as const },
  },
  packs: { orderBy: { description: "asc" as const } },
  companies: {
    include: { manufacturer: true },
    orderBy: { role: "asc" as const },
  },
} satisfies Prisma.MedicineInclude;

export type MedicineDetail = Prisma.MedicineGetPayload<{ include: typeof medicineInclude }>;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  async assertActivePlatformAdmin(actorUserId: string): Promise<void> {
    const admin = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actorUserId,
        role: MembershipRole.PLATFORM_ADMIN,
        status: MembershipStatus.ACTIVE,
        organization: { type: OrganizationType.PLATFORM },
      },
    });
    if (!admin) {
      throw new CatalogForbiddenError();
    }
  }

  async createIngredient(actorUserId: string, input: CreateIngredientRequest) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      const canonicalName = collapse(input.canonicalName);
      const normalizedName = this.readName(canonicalName);
      const aliases = this.readAliases(input.aliases, normalizedName);
      await this.assertAliasesFree(tx, aliases.map((alias) => alias.normalizedAlias));
      try {
        const ingredient = await tx.ingredient.create({
          data: {
            canonicalName,
            normalizedName,
            kind: input.kind as IngredientKind,
            aliases: { create: aliases },
          },
          include: { aliases: { orderBy: { alias: "asc" } } },
        });
        await this.audit(tx, actorUserId, "ingredient.create", "ingredient", ingredient.id);
        return ingredient;
      } catch (error) {
        this.rethrowDuplicate(error);
      }
    });
  }

  async updateIngredient(
    actorUserId: string,
    ingredientId: string,
    input: UpdateIngredientRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      const current = await tx.ingredient.findUnique({ where: { id: ingredientId } });
      if (!current) {
        throw new IngredientNotFoundError();
      }
      const canonicalName = collapse(input.canonicalName);
      const normalizedName = this.readName(canonicalName);
      const aliases = this.readAliases(input.aliases, normalizedName);
      await tx.ingredientAlias.deleteMany({ where: { ingredientId } });
      await this.assertAliasesFree(tx, aliases.map((alias) => alias.normalizedAlias));
      try {
        const ingredient = await tx.ingredient.update({
          where: { id: ingredientId },
          data: {
            canonicalName,
            normalizedName,
            kind: input.kind as IngredientKind,
            aliases: { create: aliases },
          },
          include: { aliases: { orderBy: { alias: "asc" } } },
        });
        const links = await tx.medicineComposition.findMany({
          where: { ingredientId },
          select: { medicineId: true },
        });
        await this.refreshMany(tx, links.map((link) => link.medicineId));
        await this.audit(tx, actorUserId, "ingredient.update", "ingredient", ingredient.id);
        return ingredient;
      } catch (error) {
        this.rethrowDuplicate(error);
      }
    });
  }

  async createManufacturer(actorUserId: string, input: CreateManufacturerRequest) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      try {
        const manufacturer = await tx.manufacturer.create({
          data: {
            canonicalName: collapse(input.canonicalName),
            normalizedName: this.readName(input.canonicalName),
            countryCode: input.countryCode ?? null,
          },
        });
        await this.audit(tx, actorUserId, "manufacturer.create", "manufacturer", manufacturer.id);
        return manufacturer;
      } catch (error) {
        this.rethrowDuplicate(error);
      }
    });
  }

  async updateManufacturer(
    actorUserId: string,
    manufacturerId: string,
    input: UpdateManufacturerRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      const current = await tx.manufacturer.findUnique({ where: { id: manufacturerId } });
      if (!current) {
        throw new ManufacturerNotFoundError();
      }
      try {
        const manufacturer = await tx.manufacturer.update({
          where: { id: manufacturerId },
          data: {
            canonicalName: collapse(input.canonicalName),
            normalizedName: this.readName(input.canonicalName),
            countryCode: input.countryCode ?? null,
          },
        });
        const links = await tx.medicineManufacturer.findMany({
          where: { manufacturerId },
          select: { medicineId: true },
        });
        await this.refreshMany(tx, links.map((link) => link.medicineId));
        await this.audit(tx, actorUserId, "manufacturer.update", "manufacturer", manufacturer.id);
        return manufacturer;
      } catch (error) {
        this.rethrowDuplicate(error);
      }
    });
  }

  async createMedicine(actorUserId: string, input: CreateMedicineRequest): Promise<MedicineDetail> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      const displayName = collapse(input.displayName);
      try {
        const medicine = await tx.medicine.create({
          data: {
            displayName,
            normalizedDisplayName: this.readName(displayName),
            brandName: optionalText(input.brandName),
            genericName: collapse(input.genericName),
            dosageForm: collapse(input.dosageForm),
            presentation: optionalText(input.presentation),
            status: CatalogStatus.DRAFT,
            searchVisible: false,
            sourceLabel: input.sourceLabel ?? "manual",
            sourceReference: input.sourceReference ?? null,
            searchText: buildSearchText([
              displayName,
              input.brandName,
              input.genericName,
              input.dosageForm,
              input.presentation,
            ]),
          },
        });
        await this.audit(tx, actorUserId, "medicine.create", "medicine", medicine.id);
        return this.load(tx, medicine.id);
      } catch (error) {
        this.rethrowDuplicate(error);
      }
    });
  }

  async updateMedicine(
    actorUserId: string,
    medicineId: string,
    input: UpdateMedicineRequest,
  ): Promise<MedicineDetail> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      const current = await this.requireDraft(tx, medicineId);
      const displayName =
        input.displayName === undefined ? current.displayName : collapse(input.displayName);
      try {
        await tx.medicine.update({
          where: { id: medicineId },
          data: {
            displayName,
            normalizedDisplayName: this.readName(displayName),
            brandName:
              input.brandName === undefined ? current.brandName : optionalText(input.brandName),
            genericName:
              input.genericName === undefined ? current.genericName : collapse(input.genericName),
            dosageForm:
              input.dosageForm === undefined ? current.dosageForm : collapse(input.dosageForm),
            presentation:
              input.presentation === undefined
                ? current.presentation
                : optionalText(input.presentation),
            sourceLabel: input.sourceLabel ?? current.sourceLabel,
            sourceReference:
              input.sourceReference === undefined ? current.sourceReference : input.sourceReference,
          },
        });
        await this.refreshSearchText(tx, medicineId);
        await this.audit(tx, actorUserId, "medicine.update", "medicine", medicineId);
        return this.load(tx, medicineId);
      } catch (error) {
        this.rethrowDuplicate(error);
      }
    });
  }

  async replaceComposition(
    actorUserId: string,
    medicineId: string,
    input: ReplaceCompositionRequest,
  ): Promise<MedicineDetail> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      await this.requireDraft(tx, medicineId);
      this.assertUnique(input.lines.map((line) => line.ingredientId));
      this.assertUnique(input.lines.map((line) => String(line.sequence)));
      const ingredientIds = [...new Set(input.lines.map((line) => line.ingredientId))];
      const found = await tx.ingredient.count({ where: { id: { in: ingredientIds } } });
      if (found !== ingredientIds.length) {
        throw new IngredientNotFoundError();
      }
      await tx.medicineComposition.deleteMany({ where: { medicineId } });
      if (input.lines.length > 0) {
        await tx.medicineComposition.createMany({
          data: input.lines.map((line) => ({
            medicineId,
            ingredientId: line.ingredientId,
            strengthValue: line.strengthValue,
            strengthUnit: line.strengthUnit as StrengthUnit,
            basis: line.basis ?? null,
            sequence: line.sequence,
          })),
        });
      }
      await this.refreshSearchText(tx, medicineId);
      await this.audit(tx, actorUserId, "composition.replace", "medicine", medicineId);
      return this.load(tx, medicineId);
    });
  }

  async replacePacks(
    actorUserId: string,
    medicineId: string,
    input: ReplacePacksRequest,
  ): Promise<MedicineDetail> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      await this.requireDraft(tx, medicineId);
      const descriptions = input.packs.map((pack) => collapse(pack.description));
      this.assertUnique(descriptions.map((description) => description.toLowerCase()));
      await tx.medicinePack.deleteMany({ where: { medicineId } });
      if (input.packs.length > 0) {
        await tx.medicinePack.createMany({
          data: input.packs.map((pack, index) => ({
            medicineId,
            description: descriptions[index] ?? collapse(pack.description),
            quantity: pack.quantity,
            unit: pack.unit as PackUnit,
          })),
        });
      }
      await this.refreshSearchText(tx, medicineId);
      await this.audit(tx, actorUserId, "pack.replace", "medicine", medicineId);
      return this.load(tx, medicineId);
    });
  }

  async replaceManufacturers(
    actorUserId: string,
    medicineId: string,
    input: ReplaceManufacturersRequest,
  ): Promise<MedicineDetail> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      await this.requireDraft(tx, medicineId);
      this.assertUnique(input.companies.map((company) => `${company.manufacturerId}:${company.role}`));
      const manufacturerIds = [...new Set(input.companies.map((company) => company.manufacturerId))];
      const found = await tx.manufacturer.count({ where: { id: { in: manufacturerIds } } });
      if (found !== manufacturerIds.length) {
        throw new ManufacturerNotFoundError();
      }
      await tx.medicineManufacturer.deleteMany({ where: { medicineId } });
      if (input.companies.length > 0) {
        await tx.medicineManufacturer.createMany({
          data: input.companies.map((company) => ({
            medicineId,
            manufacturerId: company.manufacturerId,
            role: company.role as MedicineCompanyRole,
          })),
        });
      }
      await this.refreshSearchText(tx, medicineId);
      await this.audit(tx, actorUserId, "manufacturer_link.replace", "medicine", medicineId);
      return this.load(tx, medicineId);
    });
  }

  async publishMedicine(
    actorUserId: string,
    medicineId: string,
    input: PublishMedicineRequest,
  ): Promise<MedicineDetail> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
      if (!medicine) {
        throw new MedicineNotFoundError();
      }
      if (medicine.status !== CatalogStatus.DRAFT) {
        throw new InvalidCatalogTransitionError();
      }
      await tx.medicine.update({
        where: { id: medicineId },
        data: {
          status: CatalogStatus.PUBLISHED,
          searchVisible: input.searchVisible,
        },
      });
      await this.audit(tx, actorUserId, "medicine.publish", "medicine", medicineId);
      return this.load(tx, medicineId);
    });
  }

  async archiveMedicine(actorUserId: string, medicineId: string): Promise<MedicineDetail> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlatformAdmin(tx, actorUserId);
      const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
      if (!medicine) {
        throw new MedicineNotFoundError();
      }
      if (medicine.status === CatalogStatus.ARCHIVED) {
        throw new InvalidCatalogTransitionError();
      }
      await tx.medicine.update({
        where: { id: medicineId },
        data: { status: CatalogStatus.ARCHIVED, searchVisible: false },
      });
      await this.audit(tx, actorUserId, "medicine.archive", "medicine", medicineId);
      return this.load(tx, medicineId);
    });
  }

  async getMedicine(actorUserId: string, medicineId: string): Promise<MedicineDetail> {
    const medicine = await this.prisma.medicine.findUnique({
      where: { id: medicineId },
      include: medicineInclude,
    });
    const admin = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actorUserId,
        role: MembershipRole.PLATFORM_ADMIN,
        status: MembershipStatus.ACTIVE,
        organization: { type: OrganizationType.PLATFORM },
      },
    });
    if (!medicine) {
      throw new MedicineNotFoundError();
    }
    const visible = medicine.status === CatalogStatus.PUBLISHED && medicine.searchVisible;
    if (!visible && !admin) {
      throw new MedicineNotFoundError();
    }
    return medicine;
  }

  async searchMedicines(query: string, page: number, pageSize: number): Promise<MedicinePage> {
    const offset = (page - 1) * pageSize;
    const where = Prisma.sql`status = 'PUBLISHED' AND search_visible = true`;
    const trimmed = query.trim();
    const match =
      trimmed.length === 0
        ? Prisma.sql`TRUE`
        : Prisma.sql`(
            to_tsvector('simple', search_text) @@ plainto_tsquery('simple', ${trimmed})
            OR search_text ILIKE ${ilikePattern(trimmed)} ESCAPE '\\'
            OR word_similarity(${trimmed}, search_text) > 0.4
          )`;
    const order =
      trimmed.length === 0
        ? Prisma.sql`display_name ASC, id ASC`
        : Prisma.sql`ts_rank(to_tsvector('simple', search_text), plainto_tsquery('simple', ${trimmed})) DESC,
            word_similarity(${trimmed}, search_text) DESC,
            display_name ASC,
            id ASC`;
    const idRows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM medicines
      WHERE ${where} AND ${match}
      ORDER BY ${order}
      LIMIT ${pageSize} OFFSET ${offset}
    `);
    const totalRows = await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total FROM medicines
      WHERE ${where} AND ${match}
    `);
    const ids = idRows.map((row) => row.id);
    const medicines =
      ids.length === 0
        ? []
        : await this.prisma.medicine.findMany({ where: { id: { in: ids } } });
    const byId = new Map(medicines.map((medicine) => [medicine.id, medicine]));
    const wholesalerCounts = await this.eligibleWholesalerCounts(ids);
    return {
      items: ids.flatMap((id) => {
        const medicine = byId.get(id);
        if (!medicine) {
          return [];
        }
        return [
          {
            id: medicine.id,
            displayName: medicine.displayName,
            brandName: medicine.brandName,
            genericName: medicine.genericName,
            dosageForm: medicine.dosageForm,
            presentation: medicine.presentation,
            status: medicine.status,
            searchVisible: medicine.searchVisible,
            eligibleWholesalerCount: wholesalerCounts.get(medicine.id) ?? 0,
          },
        ];
      }),
      page,
      pageSize,
      total: Number(totalRows[0]?.total ?? 0),
    };
  }

  private async eligibleWholesalerCounts(medicineIds: string[]): Promise<Map<string, number>> {
    if (medicineIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.distributorListing.findMany({
      where: {
        status: ListingStatus.ACTIVE,
        organization: { type: OrganizationType.DISTRIBUTOR, status: OrganizationStatus.ACTIVE },
        medicinePack: {
          medicineId: { in: medicineIds },
          medicine: { status: CatalogStatus.PUBLISHED, searchVisible: true },
        },
      },
      select: { organizationId: true, medicinePack: { select: { medicineId: true } } },
    });
    const wholesalers = new Map<string, Set<string>>();
    for (const row of rows) {
      const current = wholesalers.get(row.medicinePack.medicineId) ?? new Set<string>();
      current.add(row.organizationId);
      wholesalers.set(row.medicinePack.medicineId, current);
    }
    return new Map([...wholesalers].map(([medicineId, organizations]) => [medicineId, organizations.size]));
  }

  async publishSubmittedMedicine(
    tx: Tx,
    actorUserId: string,
    input: SubmittedMedicineInput,
  ): Promise<{ medicineId: string; linked: boolean }> {
    await this.assertPlatformAdmin(tx, actorUserId);
    const displayName = collapse(input.displayName);
    const normalized = this.readName(displayName);
    const existing = await tx.medicine.findUnique({ where: { normalizedDisplayName: normalized } });
    if (existing) {
      if (existing.status !== CatalogStatus.PUBLISHED) {
        throw new DuplicateCatalogRecordError();
      }
      await this.audit(tx, actorUserId, "medicine.link_submission", "medicine", existing.id);
      return { medicineId: existing.id, linked: true };
    }
    const genericName = collapse(input.genericName ?? displayName);
    const medicine = await tx.medicine.create({
      data: {
        displayName,
        normalizedDisplayName: normalized,
        brandName: optionalText(input.brandName),
        genericName,
        dosageForm: collapse(input.dosageForm),
        presentation: optionalText(input.presentation),
        status: CatalogStatus.DRAFT,
        searchVisible: false,
        sourceLabel: "distributor_submission",
        sourceReference: input.submissionId,
        searchText: "",
      },
    });
    for (const line of input.ingredients) {
      const ingredient = await this.ensureIngredient(tx, actorUserId, line.ingredientName, line.kind);
      await tx.medicineComposition.create({
        data: {
          medicineId: medicine.id,
          ingredientId: ingredient.id,
          strengthValue: line.strengthValue,
          strengthUnit: line.strengthUnit as StrengthUnit,
          basis: line.basis,
          sequence: line.sequence,
        },
      });
    }
    for (const pack of input.packs) {
      await tx.medicinePack.create({
        data: {
          medicineId: medicine.id,
          description: collapse(pack.description),
          quantity: pack.quantity,
          unit: pack.unit as PackUnit,
        },
      });
    }
    if (input.manufacturerName) {
      const manufacturer = await this.ensureManufacturer(tx, actorUserId, input.manufacturerName);
      await tx.medicineManufacturer.create({
        data: {
          medicineId: medicine.id,
          manufacturerId: manufacturer.id,
          role: MedicineCompanyRole.MANUFACTURER,
        },
      });
    }
    if (input.marketerName) {
      const marketer = await this.ensureManufacturer(tx, actorUserId, input.marketerName);
      await tx.medicineManufacturer.create({
        data: {
          medicineId: medicine.id,
          manufacturerId: marketer.id,
          role: MedicineCompanyRole.MARKETER,
        },
      });
    }
    await this.refreshSearchText(tx, medicine.id);
    await tx.medicine.update({
      where: { id: medicine.id },
      data: { status: CatalogStatus.PUBLISHED, searchVisible: true },
    });
    await this.audit(tx, actorUserId, "medicine.create", "medicine", medicine.id);
    await this.audit(tx, actorUserId, "medicine.publish", "medicine", medicine.id);
    return { medicineId: medicine.id, linked: false };
  }

  private async ensureIngredient(
    tx: Tx,
    actorUserId: string,
    name: string,
    kind: "ACTIVE" | "SALT",
  ): Promise<{ id: string }> {
    const canonicalName = collapse(name);
    const normalizedName = this.readName(canonicalName);
    const existing = await tx.ingredient.findUnique({ where: { normalizedName } });
    if (existing) {
      return existing;
    }
    try {
      const created = await tx.ingredient.create({
        data: { canonicalName, normalizedName, kind: kind as IngredientKind },
      });
      await this.audit(tx, actorUserId, "ingredient.create", "ingredient", created.id);
      return created;
    } catch (error) {
      if (prismaErrorCode(error) !== "P2002") {
        throw error;
      }
      const raced = await tx.ingredient.findUnique({ where: { normalizedName } });
      if (!raced) {
        throw error;
      }
      return raced;
    }
  }

  private async ensureManufacturer(tx: Tx, actorUserId: string, name: string): Promise<{ id: string }> {
    const canonicalName = collapse(name);
    const normalizedName = this.readName(canonicalName);
    const existing = await tx.manufacturer.findUnique({ where: { normalizedName } });
    if (existing) {
      return existing;
    }
    try {
      const created = await tx.manufacturer.create({
        data: { canonicalName, normalizedName },
      });
      await this.audit(tx, actorUserId, "manufacturer.create", "manufacturer", created.id);
      return created;
    } catch (error) {
      if (prismaErrorCode(error) !== "P2002") {
        throw error;
      }
      const raced = await tx.manufacturer.findUnique({ where: { normalizedName } });
      if (!raced) {
        throw error;
      }
      return raced;
    }
  }

  private async assertPlatformAdmin(tx: Tx, actorUserId: string): Promise<void> {
    const admin = await tx.organizationMembership.findFirst({
      where: {
        userId: actorUserId,
        role: MembershipRole.PLATFORM_ADMIN,
        status: MembershipStatus.ACTIVE,
        organization: { type: OrganizationType.PLATFORM },
      },
    });
    if (!admin) {
      throw new CatalogForbiddenError();
    }
  }

  private async requireDraft(tx: Tx, medicineId: string) {
    const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
    if (!medicine) {
      throw new MedicineNotFoundError();
    }
    if (medicine.status !== CatalogStatus.DRAFT) {
      throw new CatalogDraftRequiredError();
    }
    return medicine;
  }

  private async load(tx: Tx, medicineId: string): Promise<MedicineDetail> {
    const medicine = await tx.medicine.findUnique({
      where: { id: medicineId },
      include: medicineInclude,
    });
    if (!medicine) {
      throw new MedicineNotFoundError();
    }
    return medicine;
  }

  private async refreshSearchText(tx: Tx, medicineId: string): Promise<void> {
    const medicine = await this.load(tx, medicineId);
    const aliasRows = await tx.ingredientAlias.findMany({
      where: { ingredientId: { in: medicine.compositions.map((line) => line.ingredientId) } },
    });
    await tx.medicine.update({
      where: { id: medicineId },
      data: {
        searchText: buildSearchText([
          medicine.displayName,
          medicine.brandName,
          medicine.genericName,
          medicine.dosageForm,
          medicine.presentation,
          ...medicine.compositions.map((line) => line.ingredient.canonicalName),
          ...aliasRows.map((alias) => alias.alias),
          ...medicine.companies.map((company) => company.manufacturer.canonicalName),
          ...medicine.packs.map((pack) => pack.description),
        ]),
      },
    });
  }

  private async refreshMany(tx: Tx, medicineIds: string[]): Promise<void> {
    for (const medicineId of [...new Set(medicineIds)]) {
      await this.refreshSearchText(tx, medicineId);
    }
  }

  private async audit(
    tx: Tx,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await tx.catalogAuditEvent.create({
      data: { actorUserId, action, entityType, entityId },
    });
  }

  private readName(value: string): string {
    try {
      return normalizeCatalogName(value);
    } catch {
      throw new DuplicateCatalogRecordError();
    }
  }

  private readAliases(aliases: string[], ingredientName: string) {
    const seen = new Set<string>();
    return aliases.map((alias) => {
      const normalizedAlias = this.readName(alias);
      if (normalizedAlias === ingredientName || seen.has(normalizedAlias)) {
        throw new DuplicateCatalogRecordError();
      }
      seen.add(normalizedAlias);
      return { alias: collapse(alias), normalizedAlias };
    });
  }

  private async assertAliasesFree(tx: Tx, normalizedAliases: string[]): Promise<void> {
    if (normalizedAliases.length === 0) {
      return;
    }
    const [ingredient, alias] = await Promise.all([
      tx.ingredient.findFirst({ where: { normalizedName: { in: normalizedAliases } } }),
      tx.ingredientAlias.findFirst({ where: { normalizedAlias: { in: normalizedAliases } } }),
    ]);
    if (ingredient || alias) {
      throw new DuplicateCatalogRecordError();
    }
  }

  private assertUnique(values: string[]): void {
    if (new Set(values).size !== values.length) {
      throw new DuplicateCatalogRecordError();
    }
  }

  private rethrowDuplicate(error: unknown): never {
    if (prismaErrorCode(error) === "P2002") {
      throw new DuplicateCatalogRecordError();
    }
    throw error;
  }
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function optionalText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return collapse(value);
}

function ilikePattern(value: string): string {
  return `%${value.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
}
