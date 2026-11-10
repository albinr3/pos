-- La fuente es una relación tipada de la misma empresa, nunca un par de textos libre.
CREATE UNIQUE INDEX "Sale_accountId_id_key" ON "Sale"("accountId", "id");
CREATE UNIQUE INDEX "Purchase_accountId_id_key" ON "Purchase"("accountId", "id");
CREATE UNIQUE INDEX "Return_accountId_id_key" ON "Return"("accountId", "id");
CREATE UNIQUE INDEX "OperatingExpense_accountId_id_key" ON "OperatingExpense"("accountId", "id");
CREATE TABLE "FiscalDocument" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
  "saleId" TEXT, "purchaseId" TEXT, "returnId" TEXT, "expenseId" TEXT,
  "type" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'BORRADOR', "policyVersion" INTEGER NOT NULL,
  "ruleVersion" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalDocument_one_source" CHECK (num_nonnulls("saleId", "purchaseId", "returnId", "expenseId") = 1),
  CONSTRAINT "FiscalDocument_state" CHECK ("state" IN ('BORRADOR', 'ERROR_VALIDACION', 'VALIDADO', 'PREPARADO_PENDIENTE_CONEXION', 'DESCARTADO')),
  CONSTRAINT "FiscalDocument_type" CHECK ("type" IN ('E31','E32','E33','E34','E41','E43','E44','E45','E46','E47')),
  CONSTRAINT "FiscalDocument_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT,
  CONSTRAINT "FiscalDocument_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT,
  CONSTRAINT "FiscalDocument_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT,
  CONSTRAINT "FiscalDocument_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "OperatingExpense"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("accountId", "saleId") REFERENCES "Sale"("accountId", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("accountId", "purchaseId") REFERENCES "Purchase"("accountId", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("accountId", "returnId") REFERENCES "Return"("accountId", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("accountId", "expenseId") REFERENCES "OperatingExpense"("accountId", "id") ON DELETE RESTRICT,
  UNIQUE ("accountId", "id")
);
CREATE INDEX "FiscalDocument_accountId_state_idx" ON "FiscalDocument"("accountId", "state");
CREATE UNIQUE INDEX "FiscalDocument_active_sale" ON "FiscalDocument"("accountId", "saleId") WHERE "saleId" IS NOT NULL AND "state" <> 'DESCARTADO';
CREATE UNIQUE INDEX "FiscalDocument_active_purchase" ON "FiscalDocument"("accountId", "purchaseId") WHERE "purchaseId" IS NOT NULL AND "state" <> 'DESCARTADO';
CREATE UNIQUE INDEX "FiscalDocument_active_return" ON "FiscalDocument"("accountId", "returnId") WHERE "returnId" IS NOT NULL AND "state" <> 'DESCARTADO';
CREATE UNIQUE INDEX "FiscalDocument_active_expense" ON "FiscalDocument"("accountId", "expenseId") WHERE "expenseId" IS NOT NULL AND "state" <> 'DESCARTADO';
CREATE TABLE "FiscalDocumentLine" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "position" INTEGER NOT NULL CHECK ("position" > 0), "snapshot" JSONB NOT NULL,
  FOREIGN KEY ("accountId", "documentId") REFERENCES "FiscalDocument"("accountId", "id") ON DELETE RESTRICT,
  UNIQUE ("accountId", "documentId", "position")
);
CREATE TABLE "FiscalDocumentReference" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "referencedDocumentId" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
  CHECK ("documentId" <> "referencedDocumentId"),
  FOREIGN KEY ("accountId", "documentId") REFERENCES "FiscalDocument"("accountId", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("accountId", "referencedDocumentId") REFERENCES "FiscalDocument"("accountId", "id") ON DELETE RESTRICT,
  UNIQUE ("accountId", "documentId", "referencedDocumentId")
);
CREATE TABLE "FiscalDocumentEvent" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "actorUserId" TEXT, "state" TEXT NOT NULL, "reason" TEXT, "details" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId", "documentId") REFERENCES "FiscalDocument"("accountId", "id") ON DELETE RESTRICT
);
CREATE INDEX "FiscalDocumentEvent_accountId_documentId_createdAt_idx" ON "FiscalDocumentEvent"("accountId", "documentId", "createdAt");

-- Una ficha o un reintento nunca deben reescribir la copia fiscal congelada.
CREATE FUNCTION fiscal_protect_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'BORRADOR' THEN RAISE EXCEPTION 'El documento debe comenzar en borrador'; END IF;
    RETURN NEW;
  END IF;
  IF OLD."state" = 'PREPARADO_PENDIENTE_CONEXION' THEN RAISE EXCEPTION 'Documento fiscal congelado'; END IF;
  IF TG_OP = 'UPDATE' AND NEW."state" <> OLD."state" AND NOT (
    (OLD."state" = 'BORRADOR' AND NEW."state" IN ('ERROR_VALIDACION', 'VALIDADO', 'DESCARTADO')) OR
    (OLD."state" = 'ERROR_VALIDACION' AND NEW."state" IN ('BORRADOR', 'VALIDADO', 'DESCARTADO')) OR
    (OLD."state" = 'VALIDADO' AND NEW."state" IN ('BORRADOR', 'ERROR_VALIDACION', 'PREPARADO_PENDIENTE_CONEXION', 'DESCARTADO'))
  ) THEN RAISE EXCEPTION 'Transición fiscal inválida'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER fiscal_document_immutable BEFORE INSERT OR UPDATE OR DELETE ON "FiscalDocument" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_document();
CREATE FUNCTION fiscal_protect_detail() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid TEXT; did TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN aid := NEW."accountId"; did := NEW."documentId"; ELSE aid := OLD."accountId"; did := OLD."documentId"; END IF;
  IF EXISTS (SELECT 1 FROM "FiscalDocument" WHERE "accountId" = aid AND "id" = did AND "state" = 'PREPARADO_PENDIENTE_CONEXION') THEN RAISE EXCEPTION 'Detalle fiscal congelado'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW."accountId" <> OLD."accountId" OR NEW."documentId" <> OLD."documentId") THEN RAISE EXCEPTION 'No se puede mover un detalle fiscal'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER fiscal_line_immutable BEFORE INSERT OR UPDATE OR DELETE ON "FiscalDocumentLine" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_detail();
CREATE TRIGGER fiscal_reference_immutable BEFORE INSERT OR UPDATE OR DELETE ON "FiscalDocumentReference" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_detail();
CREATE FUNCTION fiscal_protect_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historial fiscal inmutable'; END $$;
CREATE TRIGGER fiscal_event_immutable BEFORE UPDATE OR DELETE ON "FiscalDocumentEvent" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_event();
