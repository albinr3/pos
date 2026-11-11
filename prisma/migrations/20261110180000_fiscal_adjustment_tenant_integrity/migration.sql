-- Las relaciones financieras se verifican por empresa incluso si otra ruta escribe directamente.
CREATE UNIQUE INDEX IF NOT EXISTS "User_accountId_id_key" ON "User" ("accountId", id);
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_accountId_id_key" ON "Customer" ("accountId", id);
CREATE UNIQUE INDEX IF NOT EXISTS "TreasuryAccount_accountId_id_key" ON "TreasuryAccount" ("accountId", id);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountReceivable_accountId_id_key" ON "AccountReceivable" ("accountId", id);

ALTER TABLE "FiscalAdjustmentApplication"
  ADD CONSTRAINT "FiscalAdjustmentApplication_receivable_tenant_fkey" FOREIGN KEY ("accountId", "receivableId") REFERENCES "AccountReceivable" ("accountId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FiscalAdjustmentApplication_treasury_tenant_fkey" FOREIGN KEY ("accountId", "treasuryAccountId") REFERENCES "TreasuryAccount" ("accountId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FiscalAdjustmentApplication_actor_tenant_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "User" ("accountId", id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalCustomerCredit"
  ADD CONSTRAINT "FiscalCustomerCredit_customer_tenant_fkey" FOREIGN KEY ("accountId", "customerId") REFERENCES "Customer" ("accountId", id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalCustomerCreditApplication"
  ADD CONSTRAINT "FiscalCustomerCreditApplication_receivable_tenant_fkey" FOREIGN KEY ("accountId", "receivableId") REFERENCES "AccountReceivable" ("accountId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FiscalCustomerCreditApplication_actor_tenant_fkey" FOREIGN KEY ("accountId", "actorUserId") REFERENCES "User" ("accountId", id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una aplicación de deuda solo puede afectar a la venta fiscal de la que nació su E34.
CREATE FUNCTION fiscal_adjustment_application_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FiscalAdjustment" a WHERE a."accountId" = NEW."accountId" AND a.id = NEW."adjustmentId" AND a.type = 'E34') THEN
    RAISE EXCEPTION 'La aplicación requiere una nota de crédito de la empresa';
  END IF;
  IF NEW.kind = 'DEBT' AND NOT EXISTS (
    SELECT 1 FROM "FiscalAdjustment" a
      JOIN "FiscalDocument" d ON d."accountId" = a."accountId" AND d.id = a."originalDocumentId"
      JOIN "AccountReceivable" ar ON ar."accountId" = a."accountId" AND ar."saleId" = d."saleId"
    WHERE a."accountId" = NEW."accountId" AND a.id = NEW."adjustmentId" AND ar.id = NEW."receivableId"
  ) THEN RAISE EXCEPTION 'La deuda no corresponde a la factura original'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_adjustment_application_origin_guard_trigger BEFORE INSERT OR UPDATE ON "FiscalAdjustmentApplication" FOR EACH ROW EXECUTE FUNCTION fiscal_adjustment_application_origin_guard();

-- El saldo debe pertenecer al comprador no genérico de la factura conservada.
CREATE FUNCTION fiscal_customer_credit_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "FiscalAdjustment" a
      JOIN "FiscalDocument" d ON d."accountId" = a."accountId" AND d.id = a."originalDocumentId"
      JOIN "Sale" s ON s."accountId" = a."accountId" AND s.id = d."saleId"
      JOIN "Customer" c ON c."accountId" = a."accountId" AND c.id = s."customerId"
    WHERE a."accountId" = NEW."accountId" AND a.id = NEW."adjustmentId" AND a.type = 'E34'
      AND c.id = NEW."customerId" AND NOT c."isGeneric" AND a.snapshot->'buyer'->>'id' = c.id
  ) THEN RAISE EXCEPTION 'El saldo a favor no coincide con el comprador original'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_customer_credit_owner_guard_trigger BEFORE INSERT OR UPDATE OF "accountId", "adjustmentId", "customerId" ON "FiscalCustomerCredit" FOR EACH ROW EXECUTE FUNCTION fiscal_customer_credit_owner_guard();

-- Las aplicaciones de saldo nunca pueden cruzar clientes aunque compartan empresa.
CREATE FUNCTION fiscal_customer_credit_application_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "FiscalCustomerCredit" c JOIN "AccountReceivable" ar ON ar."accountId" = c."accountId" AND ar.id = NEW."receivableId" AND ar."customerId" = c."customerId"
    WHERE c."accountId" = NEW."accountId" AND c.id = NEW."creditId"
  ) THEN RAISE EXCEPTION 'El saldo y la deuda pertenecen a clientes distintos'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_customer_credit_application_owner_guard_trigger BEFORE INSERT OR UPDATE ON "FiscalCustomerCreditApplication" FOR EACH ROW EXECUTE FUNCTION fiscal_customer_credit_application_owner_guard();

ALTER TABLE "Return" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
-- Cada devolución fiscal conserva las cantidades exactas que repuso, incluido el resto de redondeo.
ALTER TABLE "ReturnItem" ADD COLUMN IF NOT EXISTS "fiscalRestorations" JSONB;

-- La devolución debe pertenecer a la misma factura de la nota, incluso si se inserta fuera del servicio.
CREATE FUNCTION fiscal_physical_return_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."fiscalAdjustmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "FiscalAdjustment" a JOIN "FiscalDocument" d ON d."accountId" = a."accountId" AND d.id = a."originalDocumentId"
    WHERE a."accountId" = NEW."accountId" AND a.id = NEW."fiscalAdjustmentId" AND a.type = 'E34' AND d."saleId" = NEW."saleId"
  ) THEN RAISE EXCEPTION 'La devolución no coincide con la factura original de la nota'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fiscal_physical_return_origin_guard_trigger BEFORE INSERT OR UPDATE OF "accountId", "saleId", "fiscalAdjustmentId" ON "Return" FOR EACH ROW EXECUTE FUNCTION fiscal_physical_return_origin_guard();

-- Una copia preparada solo admite la reversión física auditada y con motivo; nunca borrar ni cambiar sus importes.
CREATE FUNCTION fiscal_physical_return_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."fiscalAdjustmentId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "FiscalAdjustment" a WHERE a."accountId" = OLD."accountId" AND a.id = OLD."fiscalAdjustmentId" AND a.state = 'PREPARADO_PENDIENTE_CONEXION'
  ) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'La devolución fiscal está protegida'; END IF;
    IF OLD."cancelledAt" IS NOT NULL OR NEW."cancelledAt" IS NULL OR NEW."cancelledBy" IS NULL OR length(trim(coalesce(NEW."cancellationReason", ''))) = 0
      OR (to_jsonb(NEW) - ARRAY['cancelledAt', 'cancelledBy', 'cancellationReason', 'updatedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['cancelledAt', 'cancelledBy', 'cancellationReason', 'updatedAt'])
      OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u."accountId" = OLD."accountId" AND u.id = NEW."cancelledBy")
    THEN RAISE EXCEPTION 'Solo se permite revertir la devolución fiscal con motivo y autor válidos'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER fiscal_physical_return_protect_trigger BEFORE UPDATE OR DELETE ON "Return" FOR EACH ROW EXECUTE FUNCTION fiscal_physical_return_protect();

-- Las cantidades devueltas son evidencia de inventario: no alterarlas ni moverlas después de preparar la nota.
CREATE FUNCTION fiscal_physical_return_item_protect() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_return TEXT; new_return TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_return := OLD."returnId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_return := NEW."returnId"; END IF;
  IF EXISTS (
    SELECT 1 FROM "Return" r JOIN "FiscalAdjustment" a ON a."accountId" = r."accountId" AND a.id = r."fiscalAdjustmentId"
    WHERE r.id IN (old_return, new_return) AND a.state = 'PREPARADO_PENDIENTE_CONEXION'
  ) THEN RAISE EXCEPTION 'Los artículos de la devolución fiscal están protegidos'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER fiscal_physical_return_item_protect_trigger BEFORE INSERT OR UPDATE OR DELETE ON "ReturnItem" FOR EACH ROW EXECUTE FUNCTION fiscal_physical_return_item_protect();
