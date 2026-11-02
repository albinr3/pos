-- Congelar el proveedor de cada pago antes de permitir cambios posteriores en la compra.
ALTER TABLE "SupplierPayment" ADD COLUMN "supplierId" TEXT,
ADD COLUMN "supplierName" TEXT;

UPDATE "SupplierPayment" AS payment
SET "supplierId" = payable."supplierId",
    "supplierName" = COALESCE(purchase."supplierName", supplier."name")
FROM "AccountPayable" AS payable
JOIN "Purchase" AS purchase ON purchase."id" = payable."purchaseId"
JOIN "Supplier" AS supplier ON supplier."id" = payable."supplierId"
WHERE payment."apId" = payable."id";

ALTER TABLE "SupplierPayment" ALTER COLUMN "supplierId" SET NOT NULL,
ALTER COLUMN "supplierName" SET NOT NULL;

ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "SupplierPayment_accountId_supplierId_paidAt_idx"
ON "SupplierPayment"("accountId", "supplierId", "paidAt");
