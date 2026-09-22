/*
  Warnings:

  - You are about to drop the column `first_name` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `last_name` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `Customer` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phoneNumber]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customerFirstName` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerLastName` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerNationality` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phoneNumber` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Customer` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Customer_phone_key";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "first_name",
DROP COLUMN "last_name",
DROP COLUMN "password",
DROP COLUMN "phone",
ADD COLUMN     "customerFirstName" TEXT NOT NULL,
ADD COLUMN     "customerLastName" TEXT NOT NULL,
ADD COLUMN     "customerNationality" TEXT NOT NULL,
ADD COLUMN     "phoneNumber" TEXT NOT NULL,
ADD COLUMN     "reglink" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phoneNumber_key" ON "Customer"("phoneNumber");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
