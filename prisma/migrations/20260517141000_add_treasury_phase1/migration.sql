-- Treasury Phase 1

-- ==========================================
-- ENUMS
-- ==========================================
CREATE TYPE "TreasuryAccountType" AS ENUM ('CAJA', 'BANCO');

-- ==========================================
-- USER PERMISSIONS
-- ==========================================
ALTER TABLE "User"
  ADD COLUMN "canViewTreasury" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageTreasuryAccounts" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canCreateTreasuryTransfers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canReverseTreasuryTransfers" BOOLEAN NOT NULL DEFAULT false;

-- Backfill para owners
UPDATE "User"
SET
  "canViewTreasury" = true,
  "canManageTreasuryAccounts" = true,
  "canCreateTreasuryTransfers" = true,
  "canReverseTreasuryTransfers" = true
WHERE "isOwner" = true;

-- ==========================================
-- TREASURY TABLES
-- ==========================================
CREATE TABLE "TreasuryAccount" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "accountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "TreasuryAccountType" NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'DOP',
  "bankName" TEXT,
  "accountNumber" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,

  CONSTRAINT "TreasuryAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreasuryOpeningBalance" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accountId" TEXT NOT NULL,
  "treasuryAccountId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "createdByUserId" TEXT,

  CONSTRAINT "TreasuryOpeningBalance_pkey" PRIMARY KEY ("id")
);

-- ==========================================
-- OPERATIVE TABLE EXTENSIONS
-- ==========================================
ALTER TABLE "Sale"
  ADD COLUMN "treasuryAccountId" TEXT;

ALTER TABLE "SalePayment"
  ADD COLUMN "treasuryAccountId" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "treasuryAccountId" TEXT;

ALTER TABLE "Purchase"
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "treasuryAccountId" TEXT;

ALTER TABLE "OperatingExpense"
  ADD COLUMN "paymentMethod" "PaymentMethod",
  ADD COLUMN "treasuryAccountId" TEXT;

ALTER TABLE "Return"
  ADD COLUMN "refundMethod" "PaymentMethod",
  ADD COLUMN "refundTreasuryAccountId" TEXT;

-- ==========================================
-- CONSTRAINTS
-- ==========================================
ALTER TABLE "TreasuryAccount"
  ADD CONSTRAINT "TreasuryAccount_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TreasuryAccount_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TreasuryOpeningBalance"
  ADD CONSTRAINT "TreasuryOpeningBalance_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TreasuryOpeningBalance_treasuryAccountId_fkey"
    FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TreasuryOpeningBalance_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_treasuryAccountId_fkey"
    FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalePayment"
  ADD CONSTRAINT "SalePayment_treasuryAccountId_fkey"
    FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_treasuryAccountId_fkey"
    FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_treasuryAccountId_fkey"
    FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OperatingExpense"
  ADD CONSTRAINT "OperatingExpense_treasuryAccountId_fkey"
    FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Return"
  ADD CONSTRAINT "Return_refundTreasuryAccountId_fkey"
    FOREIGN KEY ("refundTreasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==========================================
-- INDEXES
-- ==========================================
CREATE UNIQUE INDEX "TreasuryAccount_accountId_name_key" ON "TreasuryAccount"("accountId", "name");
CREATE INDEX "TreasuryAccount_accountId_isActive_idx" ON "TreasuryAccount"("accountId", "isActive");
CREATE INDEX "TreasuryAccount_accountId_type_isActive_idx" ON "TreasuryAccount"("accountId", "type", "isActive");

CREATE INDEX "TreasuryOpeningBalance_accountId_effectiveAt_idx" ON "TreasuryOpeningBalance"("accountId", "effectiveAt");
CREATE INDEX "TreasuryOpeningBalance_treasuryAccountId_effectiveAt_idx" ON "TreasuryOpeningBalance"("treasuryAccountId", "effectiveAt");

CREATE INDEX "Sale_treasuryAccountId_idx" ON "Sale"("treasuryAccountId");
CREATE INDEX "SalePayment_treasuryAccountId_idx" ON "SalePayment"("treasuryAccountId");
CREATE INDEX "Payment_treasuryAccountId_idx" ON "Payment"("treasuryAccountId");
CREATE INDEX "Purchase_treasuryAccountId_idx" ON "Purchase"("treasuryAccountId");
CREATE INDEX "OperatingExpense_treasuryAccountId_idx" ON "OperatingExpense"("treasuryAccountId");
CREATE INDEX "Return_refundTreasuryAccountId_idx" ON "Return"("refundTreasuryAccountId");
