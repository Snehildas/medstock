-- AlterTable
ALTER TABLE "listing_audit_events" ADD COLUMN     "import_id" UUID;

-- AddForeignKey
ALTER TABLE "listing_audit_events" ADD CONSTRAINT "listing_audit_events_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "listing_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_import_rows" ADD CONSTRAINT "listing_import_rows_matched_pack_id_fkey" FOREIGN KEY ("matched_pack_id") REFERENCES "medicine_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_import_rows" ADD CONSTRAINT "listing_import_rows_existing_listing_id_fkey" FOREIGN KEY ("existing_listing_id") REFERENCES "distributor_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
