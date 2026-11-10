CREATE TABLE "FiscalSequence" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
  "regime" TEXT NOT NULL DEFAULT 'DO_ECF' CHECK ("regime" = 'DO_ECF'),
  "environment" TEXT NOT NULL DEFAULT 'TEST' CHECK ("environment" = 'TEST'),
  "type" TEXT NOT NULL CHECK ("type" IN ('E31','E32','E33','E34','E41','E43','E44','E45','E46','E47')),
  "rangeStart" BIGINT NOT NULL, "rangeEnd" BIGINT NOT NULL, "lastNumber" BIGINT NOT NULL,
  "expiresOn" DATE, "active" BOOLEAN NOT NULL DEFAULT false, "authorizationRef" TEXT, "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("rangeStart" >= 1 AND "rangeEnd" <= 9999999999 AND "rangeStart" <= "rangeEnd" AND "lastNumber" BETWEEN "rangeStart" - 1 AND "rangeEnd"),
  CHECK (("type" IN ('E32','E34') AND "expiresOn" IS NULL) OR ("type" NOT IN ('E32','E34') AND "expiresOn" IS NOT NULL)),
  UNIQUE ("accountId", "id")
);
CREATE INDEX "FiscalSequence_accountId_type_environment_idx" ON "FiscalSequence"("accountId", "type", "environment");
CREATE UNIQUE INDEX "FiscalSequence_one_active" ON "FiscalSequence"("accountId", "regime", "environment", "type") WHERE "active";

-- El bloqueo por empresa serializa también escrituras directas y evita solapamientos concurrentes.
CREATE FUNCTION fiscal_sequence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'No se borran secuencias fiscales'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."accountId", 517));
  IF TG_OP = 'UPDATE' THEN
    IF (NEW."id", NEW."accountId", NEW."regime", NEW."environment", NEW."type", NEW."rangeStart", NEW."rangeEnd") IS DISTINCT FROM (OLD."id", OLD."accountId", OLD."regime", OLD."environment", OLD."type", OLD."rangeStart", OLD."rangeEnd") OR NEW."lastNumber" < OLD."lastNumber" OR NEW."lastNumber" > OLD."lastNumber" + 1 THEN RAISE EXCEPTION 'Identidad o contador fiscal inválido'; END IF;
  ELSE
    IF NEW."lastNumber" <> NEW."rangeStart" - 1 THEN RAISE EXCEPTION 'Contador inicial inválido'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM "FiscalSequence" s WHERE s."accountId" = NEW."accountId" AND s."regime" = NEW."regime" AND s."environment" = NEW."environment" AND s."type" = NEW."type" AND s."id" <> NEW."id" AND s."rangeStart" <= NEW."rangeEnd" AND NEW."rangeStart" <= s."rangeEnd") THEN RAISE EXCEPTION 'Rangos fiscales superpuestos'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_sequence_guard_trigger BEFORE INSERT OR UPDATE OR DELETE ON "FiscalSequence" FOR EACH ROW EXECUTE FUNCTION fiscal_sequence_guard();

CREATE TABLE "FiscalNumberAllocation" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "sequenceId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
  "environment" TEXT NOT NULL CHECK ("environment" = 'TEST'), "type" TEXT NOT NULL, "number" BIGINT NOT NULL, "eNcf" TEXT NOT NULL,
  "sequenceSnapshot" JSONB NOT NULL, "actorUserId" TEXT NOT NULL, "voidedAt" TIMESTAMP(3), "voidedBy" TEXT, "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId", "sequenceId") REFERENCES "FiscalSequence"("accountId", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("accountId", "documentId") REFERENCES "FiscalDocument"("accountId", "id") ON DELETE RESTRICT,
  CHECK (("voidedAt" IS NULL AND "voidedBy" IS NULL AND "voidReason" IS NULL) OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL AND length(trim("voidReason")) > 0)),
  CHECK ("eNcf" = "type" || lpad("number"::text, 10, '0')),
  UNIQUE ("accountId", "documentId"), UNIQUE ("accountId", "environment", "eNcf"), UNIQUE ("accountId", "sequenceId", "number")
);
CREATE TABLE "FiscalSequenceEvent" (
  "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL, "sequenceId" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "details" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId", "sequenceId") REFERENCES "FiscalSequence"("accountId", "id") ON DELETE RESTRICT
);
CREATE INDEX "FiscalSequenceEvent_accountId_sequenceId_createdAt_idx" ON "FiscalSequenceEvent"("accountId", "sequenceId", "createdAt");
CREATE FUNCTION fiscal_sequence_immutable_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historial fiscal inmutable'; END $$;
CREATE TRIGGER fiscal_sequence_event_immutable BEFORE UPDATE OR DELETE ON "FiscalSequenceEvent" FOR EACH ROW EXECUTE FUNCTION fiscal_sequence_immutable_event();
-- Un contador solo puede avanzar cuando la asignación correspondiente queda en el mismo commit.
CREATE FUNCTION fiscal_sequence_counter_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."lastNumber" <> OLD."lastNumber" AND NOT EXISTS (SELECT 1 FROM "FiscalNumberAllocation" a WHERE a."accountId"=NEW."accountId" AND a."sequenceId"=NEW.id AND a.number=NEW."lastNumber") THEN RAISE EXCEPTION 'Contador fiscal sin asignación'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER fiscal_sequence_counter_allocation_trigger AFTER UPDATE ON "FiscalSequence" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fiscal_sequence_counter_allocation();
CREATE FUNCTION fiscal_allocation_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."voidedAt" IS NOT NULL OR NEW."voidedBy" IS NOT NULL OR NEW."voidReason" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "FiscalSequence" s JOIN "FiscalDocument" d ON d."accountId"=s."accountId" WHERE s.id=NEW."sequenceId" AND s."accountId"=NEW."accountId" AND s."environment"=NEW."environment" AND s.type=NEW.type AND s."lastNumber"=NEW.number AND s.active AND d.id=NEW."documentId" AND d.type=NEW.type AND d.state='VALIDADO') THEN RAISE EXCEPTION 'Asignación fiscal incompatible'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_allocation_insert_guard_trigger BEFORE INSERT ON "FiscalNumberAllocation" FOR EACH ROW EXECUTE FUNCTION fiscal_allocation_insert_guard();
CREATE FUNCTION fiscal_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'No se borran asignaciones'; END IF;
  IF OLD."voidedAt" IS NOT NULL OR (to_jsonb(NEW) - ARRAY['voidedAt','voidedBy','voidReason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['voidedAt','voidedBy','voidReason']) OR NEW."voidedAt" IS NULL THEN RAISE EXCEPTION 'Asignación fiscal inmutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_allocation_immutable BEFORE UPDATE OR DELETE ON "FiscalNumberAllocation" FOR EACH ROW EXECUTE FUNCTION fiscal_allocation_guard();
