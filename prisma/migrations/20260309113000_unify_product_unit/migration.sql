-- Add new single unit column using the current sale unit as source of truth
ALTER TABLE "Product" ADD COLUMN "unit" "UnitType";

UPDATE "Product"
SET "unit" = COALESCE("saleUnit", 'UNIDAD'::"UnitType");

-- Legacy measured products may still be marked as BASIC even when they use a measured unit
UPDATE "Product"
SET "productKind" = 'MEASURED'::"ProductKind"
WHERE "productKind" = 'BASIC'::"ProductKind"
  AND "unit" <> 'UNIDAD'::"UnitType";

-- BASIC and RECIPE products must always use UNIDAD
UPDATE "Product"
SET "unit" = 'UNIDAD'::"UnitType"
WHERE "productKind" IN ('BASIC'::"ProductKind", 'RECIPE'::"ProductKind");

ALTER TABLE "Product"
ALTER COLUMN "unit" SET NOT NULL,
ALTER COLUMN "unit" SET DEFAULT 'UNIDAD'::"UnitType";

ALTER TABLE "Product"
ADD CONSTRAINT "Product_unit_matches_kind_check"
CHECK (
  ("productKind" = 'MEASURED'::"ProductKind" AND "unit" <> 'UNIDAD'::"UnitType")
  OR
  ("productKind" IN ('BASIC'::"ProductKind", 'RECIPE'::"ProductKind") AND "unit" = 'UNIDAD'::"UnitType")
);

ALTER TABLE "Product"
DROP COLUMN "purchaseUnit",
DROP COLUMN "saleUnit";
