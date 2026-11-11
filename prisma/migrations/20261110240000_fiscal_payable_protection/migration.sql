-- Los abonos actualizan saldo y estado, pero no pueden reescribir el origen o las retenciones congeladas.
CREATE FUNCTION fiscal_protect_e41_payable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "FiscalDocument" d WHERE d."accountId"=OLD."accountId" AND d.type='E41' AND d.state='PREPARADO_PENDIENTE_CONEXION' AND (d."payableId"=OLD.id OR (OLD."purchaseId" IS NOT NULL AND d."purchaseId"=OLD."purchaseId"))) THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cuenta protegida por E41 preparado'; END IF;
    IF (NEW."accountId",NEW."purchaseId",NEW."supplierId",NEW.description,NEW."supplierReceiptNumber",NEW."dueDate",NEW."totalCents",NEW."withheldItbisCents",NEW."withheldIsrCents") IS DISTINCT FROM (OLD."accountId",OLD."purchaseId",OLD."supplierId",OLD.description,OLD."supplierReceiptNumber",OLD."dueDate",OLD."totalCents",OLD."withheldItbisCents",OLD."withheldIsrCents") THEN
      RAISE EXCEPTION 'Datos congelados por E41 preparado';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "AccountPayable_e41_fiscal_protected" BEFORE UPDATE OR DELETE ON "AccountPayable" FOR EACH ROW EXECUTE FUNCTION fiscal_protect_e41_payable();
