-- Datos administrativos escritos; no se guardan archivos y no se modifican históricos.
CREATE TABLE "FiscalReceivedDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
  "sourceKind" TEXT NOT NULL CHECK ("sourceKind" IN ('PURCHASE', 'PAYABLE', 'EXPENSE')),
  "sourceId" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalReceivedDocument_accountId_sourceKind_sourceId_key" UNIQUE ("accountId", "sourceKind", "sourceId"),
  CONSTRAINT "FiscalReceivedDocument_accountId_id_key" UNIQUE ("accountId", "id")
);
CREATE INDEX "FiscalReceivedDocument_accountId_createdAt_id_idx" ON "FiscalReceivedDocument"("accountId", "createdAt", "id");
CREATE TABLE "FiscalReceivedOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
  "operationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "data" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalReceivedOperation_accountId_operationId_key" UNIQUE ("accountId", "operationId"),
  CONSTRAINT "FiscalReceivedOperation_document_fkey" FOREIGN KEY ("accountId", "documentId") REFERENCES "FiscalReceivedDocument"("accountId", "id") ON DELETE RESTRICT
);
CREATE INDEX "FiscalReceivedOperation_accountId_documentId_revision_idx" ON "FiscalReceivedOperation"("accountId", "documentId", "revision");
-- Una revisión es evidencia de la captura; editarla borraría el rastro de quién cambió los datos.
CREATE FUNCTION fiscal_protect_received_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las revisiones de comprobantes recibidos son inmutables';
END;
$$;
CREATE TRIGGER "FiscalReceivedOperation_immutable" BEFORE UPDATE OR DELETE ON "FiscalReceivedOperation"
  FOR EACH ROW EXECUTE FUNCTION fiscal_protect_received_operation();
