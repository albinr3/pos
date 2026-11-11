-- Una nota financiera tiene origen propio; la factura y la devolución física conservan su identidad.
ALTER TABLE "FiscalDocument" ADD COLUMN "adjustmentId" TEXT;
ALTER TABLE "FiscalDocument" DROP CONSTRAINT "FiscalDocument_one_source";
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_one_source" CHECK (num_nonnulls("saleId", "purchaseId", "returnId", "expenseId", "adjustmentId") = 1);
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_adjustment_fkey" FOREIGN KEY ("accountId", "adjustmentId") REFERENCES "FiscalAdjustment"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "FiscalDocument_accountId_adjustmentId_key" ON "FiscalDocument"("accountId", "adjustmentId");

ALTER TABLE "Return" ADD COLUMN "fiscalAdjustmentId" TEXT;
ALTER TABLE "Return" ADD CONSTRAINT "Return_fiscalAdjustment_fkey" FOREIGN KEY ("accountId", "fiscalAdjustmentId") REFERENCES "FiscalAdjustment"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Return_accountId_fiscalAdjustmentId_key" ON "Return"("accountId", "fiscalAdjustmentId");

CREATE TABLE "FiscalAdjustmentApplication" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
  "adjustmentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "receivableId" TEXT REFERENCES "AccountReceivable"("id") ON DELETE RESTRICT,
  "treasuryAccountId" TEXT REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT,
  "method" "PaymentMethod",
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId", "adjustmentId") REFERENCES "FiscalAdjustment"("accountId", "id") ON DELETE RESTRICT,
  CONSTRAINT "FiscalAdjustmentApplication_kind_check" CHECK (
    ("kind" = 'DEBT' AND "receivableId" IS NOT NULL AND "treasuryAccountId" IS NULL AND "method" IS NULL) OR
    ("kind" = 'REFUND' AND "receivableId" IS NULL AND "treasuryAccountId" IS NOT NULL AND "method" IS NOT NULL AND "method" <> 'DIVIDIR_PAGO') OR
    ("kind" = 'CUSTOMER_CREDIT' AND "receivableId" IS NULL AND "treasuryAccountId" IS NULL AND "method" IS NULL)
  ),
  UNIQUE ("accountId", "adjustmentId", "kind")
);
CREATE INDEX "FiscalAdjustmentApplication_accountId_receivableId_idx" ON "FiscalAdjustmentApplication"("accountId", "receivableId");
CREATE INDEX "FiscalAdjustmentApplication_accountId_treasuryAccountId_createdAt_idx" ON "FiscalAdjustmentApplication"("accountId", "treasuryAccountId", "createdAt");

CREATE TABLE "FiscalCustomerCredit" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
  "adjustmentId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT,
  "originalCents" INTEGER NOT NULL CHECK ("originalCents" > 0),
  "balanceCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("accountId", "adjustmentId") REFERENCES "FiscalAdjustment"("accountId", "id") ON DELETE RESTRICT,
  CHECK ("balanceCents" >= 0 AND "balanceCents" <= "originalCents"),
  UNIQUE ("accountId", "id"),
  UNIQUE ("accountId", "adjustmentId")
);
CREATE INDEX "FiscalCustomerCredit_accountId_customerId_idx" ON "FiscalCustomerCredit"("accountId", "customerId");

CREATE TABLE "FiscalCustomerCreditApplication" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
  "creditId" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL REFERENCES "AccountReceivable"("id") ON DELETE RESTRICT,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "actorUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId", "creditId") REFERENCES "FiscalCustomerCredit"("accountId", "id") ON DELETE RESTRICT
);
CREATE INDEX "FiscalCustomerCreditApplication_accountId_receivableId_idx" ON "FiscalCustomerCreditApplication"("accountId", "receivableId");
CREATE INDEX "FiscalCustomerCreditApplication_accountId_creditId_idx" ON "FiscalCustomerCreditApplication"("accountId", "creditId");

-- Las aplicaciones ya registradas nunca se modifican para simular una corrección.
CREATE TRIGGER fiscal_adjustment_application_immutable BEFORE UPDATE OR DELETE ON "FiscalAdjustmentApplication" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_event();
CREATE TRIGGER fiscal_customer_credit_application_immutable BEFORE UPDATE OR DELETE ON "FiscalCustomerCreditApplication" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_event();

CREATE FUNCTION fiscal_adjustment_protect_prepared() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state = 'PREPARADO_PENDIENTE_CONEXION' THEN
    RAISE EXCEPTION 'Ajuste fiscal protegido';
  END IF;
  IF (NEW.id, NEW."accountId", NEW."originalDocumentId", NEW.type) IS DISTINCT FROM (OLD.id, OLD."accountId", OLD."originalDocumentId", OLD.type) THEN
    RAISE EXCEPTION 'Identidad del ajuste fiscal inmutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_adjustment_prepared_guard BEFORE UPDATE OR DELETE ON "FiscalAdjustment" FOR EACH ROW EXECUTE FUNCTION fiscal_adjustment_protect_prepared();

CREATE FUNCTION fiscal_adjustment_line_protect_prepared() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid TEXT; noteid TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN aid := NEW."accountId"; noteid := NEW."adjustmentId"; ELSE aid := OLD."accountId"; noteid := OLD."adjustmentId"; END IF;
  IF EXISTS (SELECT 1 FROM "FiscalAdjustment" WHERE "accountId" = aid AND id = noteid AND state = 'PREPARADO_PENDIENTE_CONEXION') THEN
    RAISE EXCEPTION 'Líneas del ajuste fiscal protegidas';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."accountId", NEW."adjustmentId") IS DISTINCT FROM (OLD."accountId", OLD."adjustmentId") THEN
    RAISE EXCEPTION 'No se puede mover una línea fiscal';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER fiscal_adjustment_line_prepared_guard BEFORE INSERT OR UPDATE OR DELETE ON "FiscalAdjustmentLine" FOR EACH ROW EXECUTE FUNCTION fiscal_adjustment_line_protect_prepared();
