-- CreateTable
CREATE TABLE "KycAgreement" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "documentPath" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KycAgreement_customerId_key" ON "KycAgreement"("customerId");

-- AddForeignKey
ALTER TABLE "KycAgreement" ADD CONSTRAINT "KycAgreement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
