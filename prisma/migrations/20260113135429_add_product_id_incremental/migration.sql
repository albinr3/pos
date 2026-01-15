-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS "Product_productId_seq";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productId" INTEGER;

-- Set productId for existing products (starting from 1)
UPDATE "Product" SET "productId" = subquery.row_number
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") as row_number
  FROM "Product"
) AS subquery
WHERE "Product".id = subquery.id;

-- Set default value for new products
ALTER TABLE "Product" ALTER COLUMN "productId" SET DEFAULT nextval('"Product_productId_seq"');
ALTER SEQUENCE "Product_productId_seq" OWNED BY "Product"."productId";

-- Set the sequence to start from the max productId + 1
SELECT setval('"Product_productId_seq"', COALESCE((SELECT MAX("productId") FROM "Product"), 0) + 1, false);

-- Make productId NOT NULL and unique
ALTER TABLE "Product" ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_productId_key" UNIQUE ("productId");

-- CreateIndex
CREATE INDEX "Product_productId_idx" ON "Product"("productId");











