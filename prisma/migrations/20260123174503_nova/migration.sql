/*
  Warnings:

  - A unique constraint covering the columns `[accountId,sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
DO $$
BEGIN
  IF to_regclass('\"BillingSubscription\"') IS NOT NULL THEN
    ALTER TABLE "BillingSubscription" ALTER COLUMN "priceUsdCents" SET DEFAULT 2000;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('\"Product\"') IS NOT NULL
    AND to_regclass('\"Product_accountId_sku_key\"') IS NULL THEN
    CREATE UNIQUE INDEX "Product_accountId_sku_key"
      ON "Product"("accountId", "sku")
      WHERE ("sku" IS NOT NULL);
  END IF;
END $$;
