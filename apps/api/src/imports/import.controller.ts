import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  importListQuerySchema,
  importOrganizationQuerySchema,
  type ImportListQuery,
  type ImportOrganizationQuery,
  type ListingImportPage,
  type ListingImportResponse,
} from "@medstock/shared-types";
import { z } from "zod";
import { CurrentIdentity } from "../identity/current-identity.decorator.js";
import { ImportFileRejectedError } from "../identity/domain-error.js";
import { IdentityGuard } from "../identity/identity.guard.js";
import { IdentityService } from "../identity/identity.service.js";
import type { VerifiedIdentity } from "../identity/identity-verifier.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { IMPORT_MAX_BYTES } from "./import-limits.js";
import { ImportService } from "./import.service.js";

const importIdPipe = new ZodValidationPipe(z.uuid());
const organizationQueryPipe = new ZodValidationPipe(importOrganizationQuerySchema);
const importListQueryPipe = new ZodValidationPipe(importListQuerySchema);

type UploadedImport = {
  buffer: Buffer;
  originalname: string;
  size: number;
};

@Controller()
@UseGuards(IdentityGuard)
export class ImportController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly imports: ImportService,
  ) {}

  @Post("distributor/imports")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: IMPORT_MAX_BYTES } }))
  async upload(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(organizationQueryPipe) query: ImportOrganizationQuery,
    @UploadedFile() file?: UploadedImport,
  ): Promise<ListingImportResponse> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new ImportFileRejectedError("Choose a CSV or XLSX file to upload.");
    }
    const actor = await this.identityService.provision(identity);
    return this.imports.createPreview(actor.id, query.organizationId, {
      fileName: file.originalname,
      bytes: file.buffer,
    });
  }

  @Get("distributor/imports")
  async list(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query(importListQueryPipe) query: ImportListQuery,
  ): Promise<ListingImportPage> {
    const actor = await this.identityService.provision(identity);
    return this.imports.list(actor.id, query.organizationId, query.page, query.pageSize);
  }

  @Get("distributor/imports/:importId")
  async get(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("importId", importIdPipe) importId: string,
  ): Promise<ListingImportResponse> {
    const actor = await this.identityService.provision(identity);
    return this.imports.get(actor.id, importId);
  }

  @Post("distributor/imports/:importId/commit")
  async commit(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("importId", importIdPipe) importId: string,
  ): Promise<ListingImportResponse> {
    const actor = await this.identityService.provision(identity);
    return this.imports.commit(actor.id, importId);
  }

  @Post("distributor/imports/:importId/cancel")
  async cancel(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("importId", importIdPipe) importId: string,
  ): Promise<ListingImportResponse> {
    const actor = await this.identityService.provision(identity);
    return this.imports.cancel(actor.id, importId);
  }
}

@Controller()
@UseGuards(IdentityGuard)
export class ImportAdminController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly imports: ImportService,
  ) {}

  @Get("admin/imports/:importId")
  async get(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Param("importId", importIdPipe) importId: string,
  ): Promise<ListingImportResponse> {
    const actor = await this.identityService.provision(identity);
    return this.imports.getForAdmin(actor.id, importId);
  }
}
