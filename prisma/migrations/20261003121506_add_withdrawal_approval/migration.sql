-- CreateEnum
CREATE TYPE "WithdrawalApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "FundTransaction" ADD COLUMN     "approvalRemarks" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" UUID,
ADD COLUMN     "withdrawalApprovalStatus" "WithdrawalApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
