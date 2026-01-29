-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "qtyDelta" DECIMAL(10,3) NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "batchId" TEXT,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "InventoryAdjustment_accountId_createdAt_idx" ON "InventoryAdjustment"("accountId", "createdAt");
CREATE INDEX "InventoryAdjustment_productId_createdAt_idx" ON "InventoryAdjustment"("productId", "createdAt");
CREATE INDEX "InventoryAdjustment_batchId_idx" ON "InventoryAdjustment"("batchId");

-- Enable RLS and policies
ALTER TABLE "InventoryAdjustment" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE 
  service_role_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role') INTO service_role_exists;

  IF service_role_exists THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "InventoryAdjustment" FOR ALL TO service_role USING (true) WITH CHECK (true);';
  END IF;

  EXECUTE 'CREATE POLICY "Postgres full access" ON "InventoryAdjustment" FOR ALL TO postgres USING (true) WITH CHECK (true);';
END $$;
