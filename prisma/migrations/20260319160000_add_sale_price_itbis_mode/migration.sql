-- Preferencia global: precio de venta incluye ITBIS
ALTER TABLE "CompanySettings"
ADD COLUMN "salePricesIncludeItbis" BOOLEAN NOT NULL DEFAULT true;

-- Snapshot por documento para preservar histórico
ALTER TABLE "Sale"
ADD COLUMN "salePricesIncludeItbis" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Quote"
ADD COLUMN "salePricesIncludeItbis" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Return"
ADD COLUMN "salePricesIncludeItbis" BOOLEAN NOT NULL DEFAULT true;

-- Snapshot de ITBIS por renglón para evitar reinterpretaciones futuras
ALTER TABLE "SaleItem"
ADD COLUMN "itbisRateBp" INTEGER NOT NULL DEFAULT 1800;

ALTER TABLE "QuoteItem"
ADD COLUMN "itbisRateBp" INTEGER NOT NULL DEFAULT 1800;

ALTER TABLE "ReturnItem"
ADD COLUMN "itbisRateBp" INTEGER NOT NULL DEFAULT 1800;

-- Backfill de tasas históricas por item desde producto
UPDATE "SaleItem" si
SET "itbisRateBp" = COALESCE(p."itbisRateBp", 1800)
FROM "Product" p
WHERE si."productId" = p."id";

UPDATE "QuoteItem" qi
SET "itbisRateBp" = COALESCE(p."itbisRateBp", 1800)
FROM "Product" p
WHERE qi."productId" = p."id";

-- En devoluciones prioriza snapshot del SaleItem; fallback al producto
UPDATE "ReturnItem" ri
SET "itbisRateBp" = COALESCE(
  (SELECT si."itbisRateBp" FROM "SaleItem" si WHERE si."id" = ri."saleItemId"),
  (SELECT p."itbisRateBp" FROM "Product" p WHERE p."id" = ri."productId"),
  1800
);

-- Backfill explícito de documentos existentes
UPDATE "Sale" SET "salePricesIncludeItbis" = true WHERE "salePricesIncludeItbis" IS DISTINCT FROM true;
UPDATE "Quote" SET "salePricesIncludeItbis" = true WHERE "salePricesIncludeItbis" IS DISTINCT FROM true;
UPDATE "Return" SET "salePricesIncludeItbis" = true WHERE "salePricesIncludeItbis" IS DISTINCT FROM true;
