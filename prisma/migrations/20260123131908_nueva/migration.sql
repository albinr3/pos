-- This index already exists from a previous migration in this repo.
-- Keep the migration as a no-op to avoid reapplying the same constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "Product_accountId_sku_key" ON "Product"("accountId", "sku");
