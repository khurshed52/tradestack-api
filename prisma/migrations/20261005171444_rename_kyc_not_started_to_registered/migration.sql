/*
  Warnings:

  - The values [NOT_STARTED] on the enum `KycStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "KycStatus_new" AS ENUM ('REGISTERED', 'PROFILE_IN_PROGRESS', 'PROFILE_COMPLETED', 'IDENTITY_PENDING', 'IDENTITY_IN_PROGRESS', 'IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'SIGNATURE_PENDING', 'COMPLETED', 'APPROVED', 'REJECTED');
ALTER TABLE "public"."KycProfile" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "KycProfile" ALTER COLUMN "status" TYPE "KycStatus_new" USING ("status"::text::"KycStatus_new");
ALTER TYPE "KycStatus" RENAME TO "KycStatus_old";
ALTER TYPE "KycStatus_new" RENAME TO "KycStatus";
DROP TYPE "public"."KycStatus_old";
ALTER TABLE "KycProfile" ALTER COLUMN "status" SET DEFAULT 'REGISTERED';
COMMIT;

-- AlterTable
ALTER TABLE "KycProfile" ALTER COLUMN "status" SET DEFAULT 'REGISTERED';
