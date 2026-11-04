-- Prisma does not create PostgreSQL extensions. pg_trgm supplies gin_trgm_ops
-- for the search_text index declared in schema.prisma.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IngredientKind" AS ENUM ('ACTIVE', 'SALT');

-- CreateEnum
CREATE TYPE "StrengthUnit" AS ENUM ('MG', 'MCG', 'G', 'ML', 'IU', 'PERCENT');

-- CreateEnum
CREATE TYPE "PackUnit" AS ENUM ('TABLET', 'CAPSULE', 'ML', 'G', 'VIAL', 'BOTTLE', 'PIECE');

-- CreateEnum
CREATE TYPE "MedicineCompanyRole" AS ENUM ('MANUFACTURER', 'MARKETER');

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "kind" "IngredientKind" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_aliases" (
    "id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized_alias" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "country_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicines" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "normalized_display_name" TEXT NOT NULL,
    "brand_name" TEXT,
    "generic_name" TEXT NOT NULL,
    "dosage_form" TEXT NOT NULL,
    "presentation" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "search_visible" BOOLEAN NOT NULL DEFAULT false,
    "source_label" TEXT NOT NULL DEFAULT 'manual',
    "source_reference" TEXT,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_compositions" (
    "id" UUID NOT NULL,
    "medicine_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "strength_value" DECIMAL(18,6) NOT NULL,
    "strength_unit" "StrengthUnit" NOT NULL,
    "basis" TEXT,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicine_compositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_packs" (
    "id" UUID NOT NULL,
    "medicine_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" "PackUnit" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicine_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_manufacturers" (
    "id" UUID NOT NULL,
    "medicine_id" UUID NOT NULL,
    "manufacturer_id" UUID NOT NULL,
    "role" "MedicineCompanyRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicine_manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_normalized_name_key" ON "ingredients"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_aliases_normalized_alias_key" ON "ingredient_aliases"("normalized_alias");

-- CreateIndex
CREATE INDEX "ingredient_aliases_ingredient_id_idx" ON "ingredient_aliases"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_normalized_name_key" ON "manufacturers"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "medicines_normalized_display_name_key" ON "medicines"("normalized_display_name");

-- CreateIndex
CREATE INDEX "medicines_status_search_visible_idx" ON "medicines"("status", "search_visible");

-- CreateIndex
CREATE INDEX "medicines_search_text_trgm_idx" ON "medicines" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "medicine_compositions_ingredient_id_idx" ON "medicine_compositions"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_compositions_medicine_id_ingredient_id_key" ON "medicine_compositions"("medicine_id", "ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_compositions_medicine_id_sequence_key" ON "medicine_compositions"("medicine_id", "sequence");

-- CreateIndex
CREATE INDEX "medicine_packs_medicine_id_idx" ON "medicine_packs"("medicine_id");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_packs_medicine_id_description_key" ON "medicine_packs"("medicine_id", "description");

-- CreateIndex
CREATE INDEX "medicine_manufacturers_manufacturer_id_idx" ON "medicine_manufacturers"("manufacturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_manufacturers_medicine_id_manufacturer_id_role_key" ON "medicine_manufacturers"("medicine_id", "manufacturer_id", "role");

-- CreateIndex
CREATE INDEX "catalog_audit_events_actor_user_id_idx" ON "catalog_audit_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "catalog_audit_events_entity_type_entity_id_idx" ON "catalog_audit_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "ingredient_aliases" ADD CONSTRAINT "ingredient_aliases_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_compositions" ADD CONSTRAINT "medicine_compositions_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_compositions" ADD CONSTRAINT "medicine_compositions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_packs" ADD CONSTRAINT "medicine_packs_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_manufacturers" ADD CONSTRAINT "medicine_manufacturers_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_manufacturers" ADD CONSTRAINT "medicine_manufacturers_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_audit_events" ADD CONSTRAINT "catalog_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot declare an expression index on to_tsvector.
CREATE INDEX "medicines_search_text_fts_idx" ON "medicines" USING GIN (to_tsvector('simple', "search_text"));
