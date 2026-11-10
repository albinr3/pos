-- Las revisiones y los comandos sobreviven a una respuesta HTTP perdida.
ALTER TABLE "FiscalDocument" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0);
CREATE TABLE "FiscalDocumentRevision" (
 "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
 "revision" INTEGER NOT NULL, "actorUserId" TEXT NOT NULL, "input" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("accountId", "documentId") REFERENCES "FiscalDocument"("accountId", "id") ON DELETE RESTRICT,
 UNIQUE ("accountId", "documentId", "revision")
);
CREATE TABLE "FiscalPreparationOperation" (
 "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
 "operationId" TEXT NOT NULL, "actorUserId" TEXT NOT NULL, "kind" TEXT NOT NULL CHECK ("kind" IN ('CREATE','UPDATE','PREPARE')),
 "payloadHash" TEXT NOT NULL, "documentId" TEXT, "revision" INTEGER,
 "status" TEXT NOT NULL CHECK ("status" IN ('PENDING','COMPLETED','FAILED')),
 "result" JSONB, "error" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("accountId", "documentId") REFERENCES "FiscalDocument"("accountId", "id") ON DELETE RESTRICT,
 UNIQUE ("accountId", "operationId")
);
CREATE INDEX "FiscalPreparationOperation_document_idx" ON "FiscalPreparationOperation"("accountId", "documentId", "createdAt", "id");
CREATE TRIGGER fiscal_revision_immutable BEFORE UPDATE OR DELETE ON "FiscalDocumentRevision" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_event();
-- Una operación vinculada a una copia congelada no debe alterarse al apagar el módulo.
CREATE FUNCTION fiscal_protect_commercial_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "FiscalDocument" d WHERE d."accountId"=OLD."accountId" AND d.state='PREPARADO_PENDIENTE_CONEXION' AND
     ((TG_TABLE_NAME='Sale' AND d."saleId"=OLD.id) OR (TG_TABLE_NAME='Purchase' AND d."purchaseId"=OLD.id) OR (TG_TABLE_NAME='Return' AND d."returnId"=OLD.id) OR (TG_TABLE_NAME='OperatingExpense' AND d."expenseId"=OLD.id))) THEN
    RAISE EXCEPTION 'Operación protegida por documento fiscal preparado';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER fiscal_source_sale_guard BEFORE UPDATE OR DELETE ON "Sale" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_commercial_source();
CREATE TRIGGER fiscal_source_purchase_guard BEFORE UPDATE OR DELETE ON "Purchase" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_commercial_source();
CREATE TRIGGER fiscal_source_return_guard BEFORE UPDATE OR DELETE ON "Return" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_commercial_source();
CREATE TRIGGER fiscal_source_expense_guard BEFORE UPDATE OR DELETE ON "OperatingExpense" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_commercial_source();
