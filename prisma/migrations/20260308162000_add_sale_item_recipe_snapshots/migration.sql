-- DropForeignKey
ALTER TABLE "SaleItemRecipeModifier" DROP CONSTRAINT "SaleItemRecipeModifier_modifierId_fkey";

-- DropIndex
DROP INDEX "SaleItemRecipeModifier_saleItemId_modifierId_key";

-- AlterTable
ALTER TABLE "SaleItemRecipeModifier"
ADD COLUMN "modifierName" TEXT NOT NULL,
ALTER COLUMN "modifierId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SaleItemConsumption" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "SaleItemConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleItemConsumption_saleItemId_idx" ON "SaleItemConsumption"("saleItemId");

-- CreateIndex
CREATE INDEX "SaleItemConsumption_ingredientId_idx" ON "SaleItemConsumption"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleItemRecipeModifier_saleItemId_modifierName_key" ON "SaleItemRecipeModifier"("saleItemId", "modifierName");

-- AddForeignKey
ALTER TABLE "SaleItemRecipeModifier"
ADD CONSTRAINT "SaleItemRecipeModifier_modifierId_fkey"
FOREIGN KEY ("modifierId") REFERENCES "ProductRecipeModifier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemConsumption"
ADD CONSTRAINT "SaleItemConsumption_saleItemId_fkey"
FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemConsumption"
ADD CONSTRAINT "SaleItemConsumption_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
