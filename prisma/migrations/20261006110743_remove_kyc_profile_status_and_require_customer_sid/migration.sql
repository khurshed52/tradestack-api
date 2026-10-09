/*
  Warnings:

  - You are about to drop the column `status` on the `KycProfile` table. All the data in the column will be lost.
  - Made the column `sid` on table `Customer` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "sid" SET NOT NULL;

-- AlterTable
ALTER TABLE "KycProfile" DROP COLUMN "status";
