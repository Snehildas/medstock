-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('COGNITO');

-- CreateTable
CREATE TABLE "identity_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_accounts_user_id_idx" ON "identity_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_accounts_provider_provider_subject_key" ON "identity_accounts"("provider", "provider_subject");

-- AddForeignKey
ALTER TABLE "identity_accounts" ADD CONSTRAINT "identity_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
