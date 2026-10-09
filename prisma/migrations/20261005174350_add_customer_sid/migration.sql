/*
  Warnings:

  - A unique constraint covering the columns `[sid]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "sid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_sid_key" ON "Customer"("sid");
