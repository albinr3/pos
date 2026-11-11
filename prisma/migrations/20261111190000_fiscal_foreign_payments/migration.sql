CREATE UNIQUE INDEX "SupplierPayment_accountId_id_key" ON "SupplierPayment"("accountId", "id");
CREATE TABLE "FiscalForeignOperation" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "payableId" TEXT NOT NULL,
  "currency" TEXT NOT NULL, "rate" DECIMAL(16,4) NOT NULL CHECK ("rate" > 0), "rateDate" DATE,
  "lines" JSONB NOT NULL, "supplierSnapshot" JSONB NOT NULL,
  "grossForeignCents" INTEGER NOT NULL CHECK ("grossForeignCents" > 0), "expectedWithheldForeignCents" INTEGER NOT NULL CHECK ("expectedWithheldForeignCents" >= 0),
  "grossDopCents" INTEGER NOT NULL CHECK ("grossDopCents" > 0), "expectedWithheldDopCents" INTEGER NOT NULL CHECK ("expectedWithheldDopCents" >= 0),
  "originalNetCents" INTEGER NOT NULL CHECK ("originalNetCents" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId", "payableId") REFERENCES "AccountPayable"("accountId", "id") ON DELETE RESTRICT,
  UNIQUE ("accountId", "id"), UNIQUE ("accountId", "payableId")
);
CREATE TABLE "FiscalForeignPayment" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "foreignOperationId" TEXT NOT NULL,
  "supplierPaymentId" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "roundingCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId", "foreignOperationId") REFERENCES "FiscalForeignOperation"("accountId", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("accountId", "supplierPaymentId") REFERENCES "SupplierPayment"("accountId", "id") ON DELETE RESTRICT,
  UNIQUE ("accountId", "supplierPaymentId")
);
CREATE INDEX "FiscalForeignPayment_accountId_foreignOperationId_idx" ON "FiscalForeignPayment"("accountId", "foreignOperationId");
ALTER TABLE "FiscalDocument" ADD COLUMN "supplierPaymentId" TEXT;
ALTER TABLE "FiscalDocument" DROP CONSTRAINT "FiscalDocument_one_source";
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_one_source" CHECK (num_nonnulls("saleId", "purchaseId", "returnId", "expenseId", "adjustmentId", "payableId", "supplierPaymentId") = 1);
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_accountId_supplierPaymentId_fkey" FOREIGN KEY ("accountId", "supplierPaymentId") REFERENCES "SupplierPayment"("accountId", "id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "FiscalDocument_active_supplier_payment" ON "FiscalDocument"("accountId", "supplierPaymentId") WHERE "supplierPaymentId" IS NOT NULL AND state <> 'DESCARTADO';
-- La cancelación nunca puede convertir un pago documentado en una salida inexistente.
CREATE FUNCTION fiscal_protect_foreign_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "FiscalDocument" WHERE "accountId"=OLD."accountId" AND "supplierPaymentId"=OLD.id AND state='PREPARADO_PENDIENTE_CONEXION') THEN
    RAISE EXCEPTION 'Pago exterior protegido por comprobante fiscal';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "SupplierPayment_foreign_fiscal_protected" BEFORE UPDATE OR DELETE ON "SupplierPayment" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_foreign_payment();
-- La base pagada y el reparto tributario no pueden reescribirse después de guardar un abono.
CREATE FUNCTION fiscal_protect_foreign_basis() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='FiscalForeignOperation' THEN
    IF EXISTS (SELECT 1 FROM "FiscalForeignPayment" WHERE "accountId"=OLD."accountId" AND "foreignOperationId"=OLD.id) THEN
      RAISE EXCEPTION 'Base exterior protegida por pagos';
    END IF;
  ELSE
    IF TG_OP='UPDATE' OR EXISTS (SELECT 1 FROM "FiscalDocument" WHERE "accountId"=OLD."accountId" AND "supplierPaymentId"=OLD."supplierPaymentId" AND state='PREPARADO_PENDIENTE_CONEXION') THEN
      RAISE EXCEPTION 'Asignación exterior protegida';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "FiscalForeignOperation_basis_protected" BEFORE UPDATE OR DELETE ON "FiscalForeignOperation" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_foreign_basis();
CREATE TRIGGER "FiscalForeignPayment_basis_protected" BEFORE UPDATE OR DELETE ON "FiscalForeignPayment" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_foreign_basis();
