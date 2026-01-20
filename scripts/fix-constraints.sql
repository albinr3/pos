-- Script SQL para eliminar constraints problemáticos de InvoiceSequence

-- 1. Eliminar constraint único antiguo de 'series' si existe
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'InvoiceSequence' 
        AND constraint_name = 'InvoiceSequence_series_key'
        AND constraint_type = 'UNIQUE'
    ) THEN
        ALTER TABLE "InvoiceSequence" DROP CONSTRAINT "InvoiceSequence_series_key";
        RAISE NOTICE 'Constraint InvoiceSequence_series_key eliminado';
    ELSE
        RAISE NOTICE 'Constraint InvoiceSequence_series_key no existe';
    END IF;
END $$;

-- 2. Eliminar cualquier índice único antiguo de 'series'
DROP INDEX IF EXISTS "InvoiceSequence_series_key";

-- 3. Asegurar que todos los registros tengan accountId
UPDATE "InvoiceSequence" 
SET "accountId" = 'default_account' 
WHERE "accountId" IS NULL 
   OR "accountId" NOT IN (SELECT id FROM "Account");

-- 4. Crear constraint único compuesto si no existe
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSequence_accountId_series_key" 
ON "InvoiceSequence"("accountId", "series");

-- 5. Verificar constraints finales
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'InvoiceSequence' 
  AND constraint_type = 'UNIQUE'
ORDER BY constraint_name;
