-- La protección se aplica incluso a una baja directa o en modo mantenimiento.
CREATE FUNCTION fiscal_account_retention_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "FiscalSettings" WHERE "accountId" = OLD.id AND enabled)
    OR EXISTS (SELECT 1 FROM "FiscalPolicyChange" WHERE "accountId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "FiscalSequence" WHERE "accountId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "FiscalDocument" WHERE "accountId" = OLD.id)
    -- Los intentos fallidos también son historial, aunque no se haya creado un documento.
    OR EXISTS (SELECT 1 FROM "FiscalPreparationOperation" WHERE "accountId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "FiscalReceivedDocument" WHERE "accountId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "FiscalAdjustment" WHERE "accountId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "FiscalAdjustmentOperation" WHERE "accountId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "FiscalForeignOperation" WHERE "accountId" = OLD.id)
    OR EXISTS (SELECT 1 FROM "FiscalConcept" WHERE "accountId" = OLD.id)
  THEN
    RAISE EXCEPTION 'FISCAL_RETENTION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER fiscal_account_retention_guard BEFORE DELETE ON "Account"
FOR EACH ROW EXECUTE FUNCTION fiscal_account_retention_guard();
