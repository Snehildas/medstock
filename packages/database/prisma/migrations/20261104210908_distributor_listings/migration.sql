-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ListingCurrency" AS ENUM ('INR');

-- CreateEnum
CREATE TYPE "ListingSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'API_INTEGRATION', 'SFTP_IMPORT', 'ERP_INTEGRATION', 'POS_INTEGRATION');

-- CreateTable
CREATE TABLE "distributor_listings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "medicine_pack_id" UUID NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "unit_price" DECIMAL(12,2) NOT NULL,
    "currency" "ListingCurrency" NOT NULL DEFAULT 'INR',
    "minimum_order_quantity" DECIMAL(18,6) NOT NULL,
    "stock_status" "StockStatus" NOT NULL DEFAULT 'UNKNOWN',
    "available_quantity" DECIMAL(18,6),
    "price_updated_at" TIMESTAMP(3),
    "stock_updated_at" TIMESTAMP(3),
    "source" "ListingSource" NOT NULL DEFAULT 'MANUAL',
    "source_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distributor_listings_organization_id_status_idx" ON "distributor_listings"("organization_id", "status");

-- CreateIndex
CREATE INDEX "distributor_listings_medicine_pack_id_status_idx" ON "distributor_listings"("medicine_pack_id", "status");

-- CreateIndex
CREATE INDEX "distributor_listings_status_unit_price_idx" ON "distributor_listings"("status", "unit_price");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_listings_organization_id_medicine_pack_id_key" ON "distributor_listings"("organization_id", "medicine_pack_id");

-- CreateIndex
CREATE INDEX "listing_audit_events_organization_id_idx" ON "listing_audit_events"("organization_id");

-- CreateIndex
CREATE INDEX "listing_audit_events_listing_id_idx" ON "listing_audit_events"("listing_id");

-- CreateIndex
CREATE INDEX "listing_audit_events_actor_user_id_idx" ON "listing_audit_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "distributor_listings" ADD CONSTRAINT "distributor_listings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_listings" ADD CONSTRAINT "distributor_listings_medicine_pack_id_fkey" FOREIGN KEY ("medicine_pack_id") REFERENCES "medicine_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_audit_events" ADD CONSTRAINT "listing_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_audit_events" ADD CONSTRAINT "listing_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_audit_events" ADD CONSTRAINT "listing_audit_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "distributor_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
