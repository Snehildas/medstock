-- CreateTable
CREATE TABLE "distributor_profiles" (
    "organization_id" UUID NOT NULL,
    "proprietor_name" TEXT NOT NULL,
    "landline_number" TEXT,
    "mobile_number" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_profiles_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "distributor_profile_audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributor_profile_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distributor_profile_audit_events_organization_id_idx" ON "distributor_profile_audit_events"("organization_id");

-- CreateIndex
CREATE INDEX "distributor_profile_audit_events_actor_user_id_idx" ON "distributor_profile_audit_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "distributor_profiles" ADD CONSTRAINT "distributor_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_profile_audit_events" ADD CONSTRAINT "distributor_profile_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_profile_audit_events" ADD CONSTRAINT "distributor_profile_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
