ALTER TABLE "AccountPayable" ADD COLUMN "withheldItbisCents" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "withheldIsrCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_withholdings_nonnegative" CHECK ("withheldItbisCents" >= 0 AND "withheldIsrCents" >= 0);
CREATE UNIQUE INDEX "AccountPayable_accountId_id_key" ON "AccountPayable"("accountId", "id");
ALTER TABLE "FiscalDocument" ADD COLUMN "payableId" TEXT;
ALTER TABLE "FiscalDocument" DROP CONSTRAINT "FiscalDocument_one_source";
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_one_source" CHECK (num_nonnulls("saleId", "purchaseId", "returnId", "expenseId", "adjustmentId", "payableId") = 1);
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_accountId_payableId_fkey" FOREIGN KEY ("accountId", "payableId") REFERENCES "AccountPayable"("accountId", "id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "FiscalDocument_active_payable" ON "FiscalDocument"("accountId", "payableId") WHERE "payableId" IS NOT NULL AND "state" <> 'DESCARTADO';
