-- CreateEnum
CREATE TYPE "RecipeAdjustmentType" AS ENUM ('SIN', 'EXTRA');

-- DropTable
DROP TABLE "SaleItemRecipeModifier";

-- DropTable
DROP TABLE "ProductRecipeModifierItem";

-- DropTable
DROP TABLE "ProductRecipeModifier";

-- CreateTable
CREATE TABLE "SaleItemRecipeAdjustment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "type" "RecipeAdjustmentType" NOT NULL,

    CONSTRAINT "SaleItemRecipeAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleItemRecipeAdjustment_saleItemId_ingredientId_key" ON "SaleItemRecipeAdjustment"("saleItemId", "ingredientId");

-- CreateIndex
CREATE INDEX "SaleItemRecipeAdjustment_ingredientId_idx" ON "SaleItemRecipeAdjustment"("ingredientId");

-- CreateIndex
CREATE INDEX "SaleItemRecipeAdjustment_saleItemId_idx" ON "SaleItemRecipeAdjustment"("saleItemId");

-- AddForeignKey
ALTER TABLE "SaleItemRecipeAdjustment"
ADD CONSTRAINT "SaleItemRecipeAdjustment_saleItemId_fkey"
FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemRecipeAdjustment"
ADD CONSTRAINT "SaleItemRecipeAdjustment_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
