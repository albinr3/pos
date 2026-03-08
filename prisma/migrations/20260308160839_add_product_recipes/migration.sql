-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('BASIC', 'MEASURED', 'RECIPE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productKind" "ProductKind" NOT NULL DEFAULT 'BASIC';

-- CreateTable
CREATE TABLE "ProductRecipeItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "ProductRecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecipeModifier" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductRecipeModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecipeModifierItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifierId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyDelta" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "ProductRecipeModifierItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItemRecipeModifier" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleItemId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,

    CONSTRAINT "SaleItemRecipeModifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductRecipeItem_productId_idx" ON "ProductRecipeItem"("productId");

-- CreateIndex
CREATE INDEX "ProductRecipeItem_ingredientId_idx" ON "ProductRecipeItem"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipeItem_productId_ingredientId_key" ON "ProductRecipeItem"("productId", "ingredientId");

-- CreateIndex
CREATE INDEX "ProductRecipeModifier_productId_sortOrder_idx" ON "ProductRecipeModifier"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductRecipeModifierItem_modifierId_idx" ON "ProductRecipeModifierItem"("modifierId");

-- CreateIndex
CREATE INDEX "ProductRecipeModifierItem_ingredientId_idx" ON "ProductRecipeModifierItem"("ingredientId");

-- CreateIndex
CREATE INDEX "SaleItemRecipeModifier_modifierId_idx" ON "SaleItemRecipeModifier"("modifierId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleItemRecipeModifier_saleItemId_modifierId_key" ON "SaleItemRecipeModifier"("saleItemId", "modifierId");

-- CreateIndex
CREATE INDEX "Product_accountId_productKind_idx" ON "Product"("accountId", "productKind");

-- AddForeignKey
ALTER TABLE "ProductRecipeItem" ADD CONSTRAINT "ProductRecipeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeItem" ADD CONSTRAINT "ProductRecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeModifier" ADD CONSTRAINT "ProductRecipeModifier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeModifierItem" ADD CONSTRAINT "ProductRecipeModifierItem_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "ProductRecipeModifier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeModifierItem" ADD CONSTRAINT "ProductRecipeModifierItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemRecipeModifier" ADD CONSTRAINT "SaleItemRecipeModifier_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemRecipeModifier" ADD CONSTRAINT "SaleItemRecipeModifier_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "ProductRecipeModifier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
