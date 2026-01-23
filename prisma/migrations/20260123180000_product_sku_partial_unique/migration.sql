-- Ensure SKU uniqueness per account only when SKU is present (sku IS NOT NULL).
DO $$
BEGIN
  IF to_regclass('"Product"') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "Product_accountId_sku_idx"
      ON "Product"("accountId", "sku");

    -- If a non-partial unique index exists, replace it with the partial one.
    IF to_regclass('"Product_accountId_sku_key"') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'Product_accountId_sku_key'
          AND indexdef ILIKE '%WHERE (sku IS NOT NULL)%'
      ) THEN
        DROP INDEX "Product_accountId_sku_key";
      END IF;
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS "Product_accountId_sku_key"
      ON "Product"("accountId", "sku")
      WHERE ("sku" IS NOT NULL);
  END IF;
END $$;
