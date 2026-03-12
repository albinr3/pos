CREATE TABLE "QuoteItemRecipeAdjustment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quoteItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "type" "RecipeAdjustmentType" NOT NULL,

    CONSTRAINT "QuoteItemRecipeAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuoteItemRecipeAdjustment_quoteItemId_ingredientId_key"
ON "QuoteItemRecipeAdjustment"("quoteItemId", "ingredientId");

CREATE INDEX "QuoteItemRecipeAdjustment_ingredientId_idx"
ON "QuoteItemRecipeAdjustment"("ingredientId");

CREATE INDEX "QuoteItemRecipeAdjustment_quoteItemId_idx"
ON "QuoteItemRecipeAdjustment"("quoteItemId");

ALTER TABLE "QuoteItemRecipeAdjustment"
ADD CONSTRAINT "QuoteItemRecipeAdjustment_quoteItemId_fkey"
FOREIGN KEY ("quoteItemId") REFERENCES "QuoteItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteItemRecipeAdjustment"
ADD CONSTRAINT "QuoteItemRecipeAdjustment_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "Product"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
