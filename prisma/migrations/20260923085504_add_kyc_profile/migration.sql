-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PROFILE_IN_PROGRESS', 'PROFILE_COMPLETED', 'IDENTITY_PENDING', 'IDENTITY_IN_PROGRESS', 'IDENTITY_VERIFIED', 'IDENTITY_REJECTED', 'SIGNATURE_PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "KycProfile" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "countryOfResidence" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "employmentStatus" TEXT,
    "occupation" TEXT,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sumsubApplicantId" TEXT,
    "profileCompletedAt" TIMESTAMP(3),
    "identityVerifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KycProfile_customerId_key" ON "KycProfile"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "KycProfile_sumsubApplicantId_key" ON "KycProfile"("sumsubApplicantId");

-- AddForeignKey
ALTER TABLE "KycProfile" ADD CONSTRAINT "KycProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
