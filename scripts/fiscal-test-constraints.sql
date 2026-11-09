-- db push no reproduce checks ni índices parciales de las migraciones reales.
-- Aplicar únicamente a la base local de pruebas, nunca a producción.
ALTER TABLE "AccountDeletion" ALTER COLUMN "fileKeys" SET NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_accountId_productId_key" UNIQUE USING INDEX "Product_accountId_productId_key";
ALTER TABLE "Product" ADD CONSTRAINT "Product_unit_matches_kind_check" CHECK (("productKind" = 'MEASURED' AND "unit" <> 'UNIDAD') OR ("productKind" IN ('BASIC', 'RECIPE') AND "unit" = 'UNIDAD'));
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_creditDays_check" CHECK ("creditDays" BETWEEN 0 AND 3650);
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_amounts_check" CHECK ("totalCents" > 0 AND "balanceCents" BETWEEN 0 AND "totalCents");
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_amount_check" CHECK ("amountCents" > 0);
ALTER TABLE "TreasuryTransfer" ADD CONSTRAINT "TreasuryTransfer_from_to_check" CHECK ("fromTreasuryAccountId" <> "toTreasuryAccountId");
ALTER TABLE "TreasuryTransfer" ADD CONSTRAINT "TreasuryTransfer_amountCents_positive_check" CHECK ("amountCents" > 0);
ALTER TABLE "TreasuryTransfer" ADD CONSTRAINT "TreasuryTransfer_reverses_not_self_check" CHECK ("reversesTransferId" IS NULL OR "reversesTransferId" <> "id");
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_status_check" CHECK ("status" IN ('OPEN', 'CLOSING', 'CLOSED'));
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_counts_check" CHECK ("openingCountedCents" >= 0 AND ("countedClosingCents" IS NULL OR "countedClosingCents" >= 0) AND "lastSequence" >= 0 AND ("finalSequence" IS NULL OR "finalSequence" >= "lastSequence"));
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_closed_check" CHECK ("status" <> 'CLOSED' OR ("closedAt" IS NOT NULL AND "countedClosingCents" IS NOT NULL AND "closingSnapshot" IS NOT NULL));
CREATE UNIQUE INDEX "CashShift_one_active_per_account" ON "CashShift" ("accountId") WHERE "status" IN ('OPEN', 'CLOSING');
CREATE UNIQUE INDEX "Product_accountId_sku_key" ON "Product" ("accountId", "sku") WHERE "sku" IS NOT NULL;
CREATE INDEX "TreasuryTransfer_accountId_status_idx" ON "TreasuryTransfer" ("accountId", "status");
