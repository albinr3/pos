-- Los borradores son aditivos; no convierten ventas históricas ni activan el perfil fiscal.
CREATE TABLE "FiscalAdjustment" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "originalDocumentId" TEXT NOT NULL,
  "fiscalDocumentId" TEXT,
  "type" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'BORRADOR',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "policyVersion" INTEGER NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FiscalAdjustment_type_check" CHECK ("type" IN ('E33', 'E34')),
  CONSTRAINT "FiscalAdjustment_state_check" CHECK ("state" IN ('BORRADOR', 'VALIDADO', 'DESCARTADO', 'PREPARADO_PENDIENTE_CONEXION')),
  CONSTRAINT "FiscalAdjustment_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "FiscalAdjustment_account_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FiscalAdjustment_original_fkey" FOREIGN KEY ("accountId", "originalDocumentId") REFERENCES "FiscalDocument"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FiscalAdjustment_document_fkey" FOREIGN KEY ("accountId", "fiscalDocumentId") REFERENCES "FiscalDocument"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalAdjustment_accountId_id_key" ON "FiscalAdjustment"("accountId", "id");
CREATE UNIQUE INDEX "FiscalAdjustment_accountId_fiscalDocumentId_key" ON "FiscalAdjustment"("accountId", "fiscalDocumentId");
CREATE INDEX "FiscalAdjustment_accountId_originalDocumentId_state_idx" ON "FiscalAdjustment"("accountId", "originalDocumentId", "state");

CREATE TABLE "FiscalAdjustmentLine" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "adjustmentId" TEXT NOT NULL,
  "originalLine" INTEGER NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "physicalQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amountCents" INTEGER NOT NULL,
  CONSTRAINT "FiscalAdjustmentLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FiscalAdjustmentLine_amount_check" CHECK ("originalLine" > 0 AND "quantity" > 0 AND "physicalQuantity" >= 0 AND "physicalQuantity" <= "quantity" AND "amountCents" >= 0),
  CONSTRAINT "FiscalAdjustmentLine_adjustment_fkey" FOREIGN KEY ("accountId", "adjustmentId") REFERENCES "FiscalAdjustment"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalAdjustmentLine_accountId_adjustmentId_originalLine_key" ON "FiscalAdjustmentLine"("accountId", "adjustmentId", "originalLine");
CREATE INDEX "FiscalAdjustmentLine_accountId_adjustmentId_idx" ON "FiscalAdjustmentLine"("accountId", "adjustmentId");

CREATE TABLE "FiscalAdjustmentEvent" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "adjustmentId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalAdjustmentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FiscalAdjustmentEvent_adjustment_fkey" FOREIGN KEY ("accountId", "adjustmentId") REFERENCES "FiscalAdjustment"("accountId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FiscalAdjustmentEvent_accountId_adjustmentId_createdAt_idx" ON "FiscalAdjustmentEvent"("accountId", "adjustmentId", "createdAt");

CREATE TABLE "FiscalAdjustmentOperation" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalAdjustmentOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FiscalAdjustmentOperation_account_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalAdjustmentOperation_accountId_operationId_key" ON "FiscalAdjustmentOperation"("accountId", "operationId");

-- Los eventos documentan revisiones incluso después de descartar una reserva.
CREATE TRIGGER fiscal_adjustment_event_immutable BEFORE UPDATE OR DELETE ON "FiscalAdjustmentEvent" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_event();
