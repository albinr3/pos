-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canManageCashShifts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canRecordCashMovements" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canOperateCashShifts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewAllCashShifts" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OperatingExpense" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT;

-- CreateTable
CREATE TABLE "CashControl" (
    "accountId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "treasuryAccountId" TEXT NOT NULL,
    "ledgerStartedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashControl_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "treasuryAccountId" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "cashierName" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingExpectedCents" INTEGER NOT NULL,
    "openingCountedCents" INTEGER NOT NULL,
    "openingDifferenceCents" INTEGER NOT NULL,
    "openingNote" TEXT,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "finalSequence" INTEGER,
    "expectedClosingCents" INTEGER,
    "countedClosingCents" INTEGER,
    "closingDifferenceCents" INTEGER,
    "closingNote" TEXT,
    "closedByUserId" TEXT,
    "closingSnapshot" JSONB,

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "treasuryAccountId" TEXT NOT NULL,
    "cashShiftId" TEXT,
    "userId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "method" "PaymentMethod",
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashOperation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "cashShiftId" TEXT,
    "clientSequence" INTEGER,
    "userId" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSourceLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "cashShiftId" TEXT NOT NULL,

    CONSTRAINT "CashSourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashControl_treasuryAccountId_key" ON "CashControl"("treasuryAccountId");

-- CreateIndex
CREATE INDEX "CashShift_accountId_openedAt_idx" ON "CashShift"("accountId", "openedAt");

-- CreateIndex
CREATE INDEX "CashShift_accountId_cashierUserId_openedAt_idx" ON "CashShift"("accountId", "cashierUserId", "openedAt");

-- CreateIndex
CREATE INDEX "CashMovement_accountId_recordedAt_idx" ON "CashMovement"("accountId", "recordedAt");

-- CreateIndex
CREATE INDEX "CashMovement_treasuryAccountId_recordedAt_idx" ON "CashMovement"("treasuryAccountId", "recordedAt");

-- CreateIndex
CREATE INDEX "CashMovement_cashShiftId_idx" ON "CashMovement"("cashShiftId");

-- CreateIndex
CREATE INDEX "CashMovement_accountId_sourceType_sourceId_idx" ON "CashMovement"("accountId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CashOperation_accountId_clientOperationId_key" ON "CashOperation"("accountId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "CashOperation_cashShiftId_clientSequence_key" ON "CashOperation"("cashShiftId", "clientSequence");

-- CreateIndex
CREATE INDEX "CashSourceLink_cashShiftId_idx" ON "CashSourceLink"("cashShiftId");

-- CreateIndex
CREATE UNIQUE INDEX "CashSourceLink_accountId_sourceType_sourceId_key" ON "CashSourceLink"("accountId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "CashControl" ADD CONSTRAINT "CashControl_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashControl" ADD CONSTRAINT "CashControl_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashOperation" ADD CONSTRAINT "CashOperation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashOperation" ADD CONSTRAINT "CashOperation_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSourceLink" ADD CONSTRAINT "CashSourceLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSourceLink" ADD CONSTRAINT "CashSourceLink_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Compatibilidad: los accesos anteriores conservan su alcance; gestionar incidencias es permiso crítico.
UPDATE "User" SET "canOperateCashShifts" = ("isOwner" OR "canAccessSales" OR "canAccessAccountsReceivable"),
  "canViewAllCashShifts" = ("isOwner" OR "canAccessDailyClose"), "canManageCashShifts" = "isOwner", "canRecordCashMovements" = "isOwner";
-- El índice parcial impide dos aperturas aunque lleguen desde procesos distintos.
CREATE UNIQUE INDEX "CashShift_one_active_per_account" ON "CashShift" ("accountId") WHERE "status" IN ('OPEN', 'CLOSING');
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_status_check" CHECK ("status" IN ('OPEN', 'CLOSING', 'CLOSED'));
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_counts_check" CHECK ("openingCountedCents" >= 0 AND ("countedClosingCents" IS NULL OR "countedClosingCents" >= 0) AND "lastSequence" >= 0 AND ("finalSequence" IS NULL OR "finalSequence" >= "lastSequence"));
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_closed_check" CHECK ("status" <> 'CLOSED' OR ("closedAt" IS NOT NULL AND "countedClosingCents" IS NOT NULL AND "closingSnapshot" IS NOT NULL));
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['CashControl','CashShift','CashMovement','CashOperation','CashSourceLink'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
   EXECUTE format('CREATE POLICY "Postgres full access" ON %I FOR ALL TO postgres USING (true) WITH CHECK (true)', table_name);
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
   EXECUTE format('CREATE POLICY "Service role full access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name);
  END IF;
 END LOOP;
END $$;
