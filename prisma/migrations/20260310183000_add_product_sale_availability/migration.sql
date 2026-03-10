-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "isAvailableForSale" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Product_accountId_isAvailableForSale_idx" ON "Product"("accountId", "isAvailableForSale");
