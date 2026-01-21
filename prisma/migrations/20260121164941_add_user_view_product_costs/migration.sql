/*
  Warnings:

  - A unique constraint covering the columns `[accountId,sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX IF EXISTS "Category_name_key";

-- DropIndex
DROP INDEX IF EXISTS "InvoiceSequence_series_key";

-- DropIndex
DROP INDEX IF EXISTS "Product_productId_key";

-- DropIndex
DROP INDEX IF EXISTS "Product_sku_key";

-- DropIndex
DROP INDEX IF EXISTS "Quote_quoteCode_key";

-- DropIndex
DROP INDEX IF EXISTS "Quote_quoteNumber_key";

-- DropIndex
DROP INDEX IF EXISTS "Return_returnCode_key";

-- DropIndex
DROP INDEX IF EXISTS "Return_returnNumber_key";

-- DropIndex
DROP INDEX IF EXISTS "Sale_invoiceCode_key";

-- DropIndex
DROP INDEX IF EXISTS "User_email_key";

-- DropIndex
DROP INDEX IF EXISTS "User_username_key";

-- DropIndex
DROP INDEX IF EXISTS "User_whatsappNumber_key";

-- AlterTable
ALTER TABLE "QuoteSequence" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ReturnSequence" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canViewProductCosts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewProfitReport" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Customer_accountId_isGeneric_idx" ON "Customer"("accountId", "isGeneric");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_accountId_sku_key" ON "Product"("accountId", "sku");
