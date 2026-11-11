ALTER TABLE "OperatingExpense"
  ADD COLUMN "fundingSource" TEXT NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "fiscalExpenseDetails" JSONB;
ALTER TABLE "OperatingExpense" ADD CONSTRAINT "OperatingExpense_funding_source" CHECK ("fundingSource" IN ('COMPANY','EMPLOYEE','PETTY_CASH'));
CREATE TABLE "EmployeeExpenseSettlement" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
  "expenseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "method" "PaymentMethod" NOT NULL,
  "treasuryAccountId" TEXT NOT NULL REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId", "expenseId") REFERENCES "OperatingExpense"("accountId", "id") ON DELETE RESTRICT
);
CREATE INDEX "EmployeeExpenseSettlement_accountId_expenseId_idx" ON "EmployeeExpenseSettlement"("accountId", "expenseId");
CREATE INDEX "EmployeeExpenseSettlement_accountId_createdAt_idx" ON "EmployeeExpenseSettlement"("accountId", "createdAt");
-- Una copia fiscal o un reembolso no deben quedar separados de un gasto editado o eliminado.
CREATE FUNCTION fiscal_protect_employee_expense() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "FiscalDocument" WHERE "accountId"=OLD."accountId" AND "expenseId"=OLD.id AND state='PREPARADO_PENDIENTE_CONEXION') THEN
    IF TG_OP = 'DELETE' OR (NEW."accountId", NEW.description, NEW."amountCents", NEW."fundingSource", NEW."fiscalExpenseDetails", NEW."expenseDate", NEW."treasuryAccountId", NEW."paymentMethod", NEW."cancelledAt") IS DISTINCT FROM (OLD."accountId", OLD.description, OLD."amountCents", OLD."fundingSource", OLD."fiscalExpenseDetails", OLD."expenseDate", OLD."treasuryAccountId", OLD."paymentMethod", OLD."cancelledAt") THEN
      RAISE EXCEPTION 'Gasto protegido por comprobante fiscal';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM "EmployeeExpenseSettlement" WHERE "accountId"=OLD."accountId" AND "expenseId"=OLD.id) THEN
    -- Corregir el detalle administrativo no modifica el importe ya reembolsado.
    IF TG_OP = 'DELETE' OR (NEW."accountId", NEW.description, NEW."amountCents", NEW."fundingSource", NEW."expenseDate", NEW."treasuryAccountId", NEW."paymentMethod", NEW."cancelledAt") IS DISTINCT FROM (OLD."accountId", OLD.description, OLD."amountCents", OLD."fundingSource", OLD."expenseDate", OLD."treasuryAccountId", OLD."paymentMethod", OLD."cancelledAt") THEN
      RAISE EXCEPTION 'Gasto protegido por reembolso';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "OperatingExpense_fiscal_protected" BEFORE UPDATE OR DELETE ON "OperatingExpense" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_employee_expense();
