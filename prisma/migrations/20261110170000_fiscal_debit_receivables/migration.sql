-- Los registros existentes siguen perteneciendo a su venta; no se alteran importes ni pagos.
ALTER TABLE "AccountReceivable" ADD COLUMN "accountId" TEXT;
UPDATE "AccountReceivable" ar SET "accountId" = s."accountId" FROM "Sale" s WHERE s.id = ar."saleId";
ALTER TABLE "AccountReceivable" ALTER COLUMN "accountId" SET NOT NULL;
ALTER TABLE "AccountReceivable" ALTER COLUMN "saleId" DROP NOT NULL;
ALTER TABLE "AccountReceivable" ADD COLUMN "debitAdjustmentId" TEXT;
ALTER TABLE "AccountReceivable" DROP CONSTRAINT "AccountReceivable_saleId_fkey";
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_account_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_sale_fkey" FOREIGN KEY ("accountId", "saleId") REFERENCES "Sale"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_debit_adjustment_fkey" FOREIGN KEY ("accountId", "debitAdjustmentId") REFERENCES "FiscalAdjustment"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Un solo origen impide atribuir el cargo a una venta sintética o duplicada.
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_one_origin" CHECK (num_nonnulls("saleId", "debitAdjustmentId") = 1);
CREATE UNIQUE INDEX "AccountReceivable_accountId_saleId_key" ON "AccountReceivable"("accountId", "saleId");
CREATE UNIQUE INDEX "AccountReceivable_accountId_debitAdjustmentId_key" ON "AccountReceivable"("accountId", "debitAdjustmentId");
CREATE INDEX "AccountReceivable_accountId_status_idx" ON "AccountReceivable"("accountId", "status");

CREATE FUNCTION fiscal_debit_receivable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."debitAdjustmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "FiscalAdjustment" a JOIN "Customer" c ON c.id = NEW."customerId" AND c."accountId" = a."accountId"
    WHERE a.id = NEW."debitAdjustmentId" AND a."accountId" = NEW."accountId" AND a.type = 'E33'
  ) THEN RAISE EXCEPTION 'Origen o cliente de nota de débito inválido'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_debit_receivable_guard_trigger BEFORE INSERT OR UPDATE OF "accountId", "customerId", "debitAdjustmentId" ON "AccountReceivable" FOR EACH ROW EXECUTE FUNCTION fiscal_debit_receivable_guard();
