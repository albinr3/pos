ALTER TABLE "CompanySettings"
ADD COLUMN "defaultProfitMarginBp" INTEGER NOT NULL DEFAULT 3000;

ALTER TABLE "PurchaseItem"
ADD COLUMN "salePriceCents" INTEGER,
ADD COLUMN "saleMarginBp" INTEGER,
ADD COLUMN "purchaseIncludesItbis" BOOLEAN,
ADD COLUMN "appliedItbisRateBp" INTEGER;
