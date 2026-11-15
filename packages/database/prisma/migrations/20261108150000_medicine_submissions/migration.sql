-- CreateEnum
CREATE TYPE "MedicineSubmissionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "medicine_submissions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "submitted_by_user_id" UUID NOT NULL,
    "status" "MedicineSubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "display_name" TEXT NOT NULL,
    "normalized_display_name" TEXT NOT NULL,
    "brand_name" TEXT,
    "generic_name" TEXT,
    "dosage_form" TEXT NOT NULL,
    "presentation" TEXT,
    "manufacturer_name" TEXT,
    "marketer_name" TEXT,
    "review_reason" TEXT,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "approved_medicine_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicine_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_submission_ingredients" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "ingredient_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "kind" "IngredientKind" NOT NULL,
    "strength_value" DECIMAL(18,6) NOT NULL,
    "strength_unit" "StrengthUnit" NOT NULL,
    "basis" TEXT,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "medicine_submission_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_submission_packs" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" "PackUnit" NOT NULL,

    CONSTRAINT "medicine_submission_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_submission_audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicine_submission_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medicine_submissions_organization_id_status_idx" ON "medicine_submissions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "medicine_submissions_status_created_at_idx" ON "medicine_submissions"("status", "created_at");

-- CreateIndex
CREATE INDEX "medicine_submissions_normalized_display_name_idx" ON "medicine_submissions"("normalized_display_name");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_submission_ingredients_submission_id_sequence_key" ON "medicine_submission_ingredients"("submission_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_submission_ingredients_submission_id_normalized_name_key" ON "medicine_submission_ingredients"("submission_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_submission_packs_submission_id_description_key" ON "medicine_submission_packs"("submission_id", "description");

-- CreateIndex
CREATE INDEX "medicine_submission_audit_events_submission_id_idx" ON "medicine_submission_audit_events"("submission_id");

-- CreateIndex
CREATE INDEX "medicine_submission_audit_events_organization_id_idx" ON "medicine_submission_audit_events"("organization_id");

-- CreateIndex
CREATE INDEX "medicine_submission_audit_events_actor_user_id_idx" ON "medicine_submission_audit_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "medicine_submissions" ADD CONSTRAINT "medicine_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_submissions" ADD CONSTRAINT "medicine_submissions_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_submissions" ADD CONSTRAINT "medicine_submissions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_submissions" ADD CONSTRAINT "medicine_submissions_approved_medicine_id_fkey" FOREIGN KEY ("approved_medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_submission_ingredients" ADD CONSTRAINT "medicine_submission_ingredients_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "medicine_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_submission_packs" ADD CONSTRAINT "medicine_submission_packs_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "medicine_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_submission_audit_events" ADD CONSTRAINT "medicine_submission_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_submission_audit_events" ADD CONSTRAINT "medicine_submission_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_submission_audit_events" ADD CONSTRAINT "medicine_submission_audit_events_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "medicine_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
