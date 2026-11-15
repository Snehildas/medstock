-- AlterTable
ALTER TABLE "medicine_submissions" ADD COLUMN "indicative_unit_price" DECIMAL(12,2),
ADD COLUMN "minimum_order_quantity" DECIMAL(18,6),
ADD COLUMN "stock_status" "StockStatus",
ADD COLUMN "available_quantity" DECIMAL(18,6),
ADD COLUMN "source_note" TEXT;
