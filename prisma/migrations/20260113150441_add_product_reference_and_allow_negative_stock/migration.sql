-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "reference" TEXT;

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_reference_idx" ON "Product"("reference");
