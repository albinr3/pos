-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('CONTADO', 'CREDITO');

-- CreateEnum
CREATE TYPE "APOpenStatus" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_PAYMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_PAYMENT_CANCELLED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canAccessAccountsPayable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canCancelSupplierPayments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canRegisterSupplierPayments" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "creditDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "type" "PurchaseType" NOT NULL DEFAULT 'CONTADO';

-- CreateTable
CREATE TABLE "AccountPayable" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "APOpenStatus" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "apId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "treasuryAccountId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOperation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPayable_purchaseId_key" ON "AccountPayable"("purchaseId");

-- CreateIndex
CREATE INDEX "AccountPayable_accountId_status_dueDate_idx" ON "AccountPayable"("accountId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "AccountPayable_accountId_supplierId_idx" ON "AccountPayable"("accountId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayment_accountId_paidAt_id_idx" ON "SupplierPayment"("accountId", "paidAt", "id");

-- CreateIndex
CREATE INDEX "SupplierPayment_apId_cancelledAt_idx" ON "SupplierPayment"("apId", "cancelledAt");

-- CreateIndex
CREATE INDEX "SupplierPayment_treasuryAccountId_idx" ON "SupplierPayment"("treasuryAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOperation_accountId_operationId_key" ON "PurchaseOperation"("accountId", "operationId");

-- CreateIndex
CREATE INDEX "Purchase_accountId_supplierId_type_idx" ON "Purchase"("accountId", "supplierId", "type");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_apId_fkey" FOREIGN KEY ("apId") REFERENCES "AccountPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOperation" ADD CONSTRAINT "PurchaseOperation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La migracion conserva las compras previas como CONTADO; nunca infiere deuda por nombre.
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_creditDays_check" CHECK ("creditDays" BETWEEN 0 AND 3650);
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_amounts_check" CHECK ("totalCents" > 0 AND "balanceCents" BETWEEN 0 AND "totalCents");
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_amount_check" CHECK ("amountCents" > 0);
