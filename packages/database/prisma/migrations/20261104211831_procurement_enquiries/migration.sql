-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('OPEN', 'RESPONDED', 'CLOSED');

-- CreateTable
CREATE TABLE "procurement_enquiries" (
    "id" UUID NOT NULL,
    "retailer_organization_id" UUID NOT NULL,
    "distributor_organization_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "message" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'OPEN',
    "response_message" TEXT,
    "responded_by_user_id" UUID,
    "responded_at" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_enquiry_audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "retailer_organization_id" UUID NOT NULL,
    "distributor_organization_id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_enquiry_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procurement_enquiries_retailer_organization_id_status_creat_idx" ON "procurement_enquiries"("retailer_organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "procurement_enquiries_distributor_organization_id_status_cr_idx" ON "procurement_enquiries"("distributor_organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "procurement_enquiries_listing_id_created_at_idx" ON "procurement_enquiries"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "procurement_enquiry_audit_events_enquiry_id_idx" ON "procurement_enquiry_audit_events"("enquiry_id");

-- CreateIndex
CREATE INDEX "procurement_enquiry_audit_events_actor_user_id_idx" ON "procurement_enquiry_audit_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "procurement_enquiries" ADD CONSTRAINT "procurement_enquiries_retailer_organization_id_fkey" FOREIGN KEY ("retailer_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_enquiries" ADD CONSTRAINT "procurement_enquiries_distributor_organization_id_fkey" FOREIGN KEY ("distributor_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_enquiries" ADD CONSTRAINT "procurement_enquiries_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "distributor_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_enquiries" ADD CONSTRAINT "procurement_enquiries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_enquiries" ADD CONSTRAINT "procurement_enquiries_responded_by_user_id_fkey" FOREIGN KEY ("responded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_enquiry_audit_events" ADD CONSTRAINT "procurement_enquiry_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_enquiry_audit_events" ADD CONSTRAINT "procurement_enquiry_audit_events_retailer_organization_id_fkey" FOREIGN KEY ("retailer_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_enquiry_audit_events" ADD CONSTRAINT "procurement_enquiry_audit_events_distributor_organization__fkey" FOREIGN KEY ("distributor_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_enquiry_audit_events" ADD CONSTRAINT "procurement_enquiry_audit_events_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "procurement_enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
