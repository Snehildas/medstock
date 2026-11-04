-- CreateEnum
CREATE TYPE "ListingImportStatus" AS ENUM ('PREVIEW_READY', 'COMMITTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ListingImportAction" AS ENUM ('CREATE', 'UPDATE');

-- CreateEnum
CREATE TYPE "ListingImportOutcome" AS ENUM ('APPLIED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "listing_imports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "status" "ListingImportStatus" NOT NULL DEFAULT 'PREVIEW_READY',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "created_rows" INTEGER NOT NULL DEFAULT 0,
    "updated_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "listing_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_import_rows" (
    "id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "medicine_name" TEXT,
    "pack_id_text" TEXT,
    "pack_description" TEXT,
    "indicative_unit_price" TEXT,
    "currency" TEXT,
    "minimum_order_quantity" TEXT,
    "stock_status" TEXT,
    "available_quantity" TEXT,
    "available_quantity_provided" BOOLEAN NOT NULL DEFAULT false,
    "source_note" TEXT,
    "source_note_provided" BOOLEAN NOT NULL DEFAULT false,
    "matched_pack_id" UUID,
    "existing_listing_id" UUID,
    "action" "ListingImportAction",
    "errors" TEXT[],
    "warnings" TEXT[],
    "outcome" "ListingImportOutcome",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_import_audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_import_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_imports_organization_id_status_created_at_idx" ON "listing_imports"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "listing_imports_organization_id_checksum_idx" ON "listing_imports"("organization_id", "checksum");

-- CreateIndex
CREATE INDEX "listing_import_rows_import_id_idx" ON "listing_import_rows"("import_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_import_rows_import_id_row_number_key" ON "listing_import_rows"("import_id", "row_number");

-- CreateIndex
CREATE INDEX "listing_import_audit_events_import_id_idx" ON "listing_import_audit_events"("import_id");

-- CreateIndex
CREATE INDEX "listing_import_audit_events_actor_user_id_idx" ON "listing_import_audit_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "listing_imports" ADD CONSTRAINT "listing_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_imports" ADD CONSTRAINT "listing_imports_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_import_rows" ADD CONSTRAINT "listing_import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "listing_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_import_audit_events" ADD CONSTRAINT "listing_import_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_import_audit_events" ADD CONSTRAINT "listing_import_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_import_audit_events" ADD CONSTRAINT "listing_import_audit_events_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "listing_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
