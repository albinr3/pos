-- Treasury Phase 2: transferencias internas + reversos

-- ==========================================
-- ENUMS
-- ==========================================
CREATE TYPE "TreasuryTransferStatus" AS ENUM ('ACTIVE', 'REVERSED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TREASURY_TRANSFER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TREASURY_TRANSFER_REVERSED';

-- ==========================================
-- TREASURY TRANSFERS
-- ==========================================
CREATE TABLE "TreasuryTransfer" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accountId" TEXT NOT NULL,
  "fromTreasuryAccountId" TEXT NOT NULL,
  "toTreasuryAccountId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "transferredAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "status" "TreasuryTransferStatus" NOT NULL DEFAULT 'ACTIVE',
  "reversesTransferId" TEXT,

  CONSTRAINT "TreasuryTransfer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TreasuryTransfer"
  ADD CONSTRAINT "TreasuryTransfer_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TreasuryTransfer_fromTreasuryAccountId_fkey"
    FOREIGN KEY ("fromTreasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TreasuryTransfer_toTreasuryAccountId_fkey"
    FOREIGN KEY ("toTreasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TreasuryTransfer_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TreasuryTransfer_reversesTransferId_fkey"
    FOREIGN KEY ("reversesTransferId") REFERENCES "TreasuryTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TreasuryTransfer_from_to_check"
    CHECK ("fromTreasuryAccountId" <> "toTreasuryAccountId"),
  ADD CONSTRAINT "TreasuryTransfer_amountCents_positive_check"
    CHECK ("amountCents" > 0),
  ADD CONSTRAINT "TreasuryTransfer_reverses_not_self_check"
    CHECK ("reversesTransferId" IS NULL OR "reversesTransferId" <> "id");

-- ==========================================
-- INDEXES
-- ==========================================
CREATE UNIQUE INDEX "TreasuryTransfer_reversesTransferId_key" ON "TreasuryTransfer"("reversesTransferId");
CREATE INDEX "TreasuryTransfer_accountId_transferredAt_idx" ON "TreasuryTransfer"("accountId", "transferredAt");
CREATE INDEX "TreasuryTransfer_fromTreasuryAccountId_transferredAt_idx" ON "TreasuryTransfer"("fromTreasuryAccountId", "transferredAt");
CREATE INDEX "TreasuryTransfer_toTreasuryAccountId_transferredAt_idx" ON "TreasuryTransfer"("toTreasuryAccountId", "transferredAt");
CREATE INDEX "TreasuryTransfer_accountId_status_idx" ON "TreasuryTransfer"("accountId", "status");
