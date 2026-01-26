-- CreateTable para ProductSequence
CREATE TABLE "ProductSequence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductSequence_accountId_key" ON "ProductSequence"("accountId");

-- CreateIndex
CREATE INDEX "ProductSequence_accountId_idx" ON "ProductSequence"("accountId");

-- AddForeignKey
ALTER TABLE "ProductSequence" ADD CONSTRAINT "ProductSequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrar datos existentes: Renumerar productos por cuenta
-- Paso 1: Crear una columna temporal para almacenar el nuevo productId
ALTER TABLE "Product" ADD COLUMN "productId_new" INTEGER;

-- Paso 2: Asignar números secuenciales por cuenta (ordenados por createdAt para mantener orden)
WITH numbered_products AS (
  SELECT 
    id,
    "accountId",
    ROW_NUMBER() OVER (PARTITION BY "accountId" ORDER BY "createdAt", id) as new_product_id
  FROM "Product"
)
UPDATE "Product" p
SET "productId_new" = np.new_product_id
FROM numbered_products np
WHERE p.id = np.id;

-- Paso 3: Eliminar el constraint único antiguo
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_accountId_productId_key";

-- Paso 4: Eliminar la columna productId antigua
ALTER TABLE "Product" DROP COLUMN "productId";

-- Paso 5: Renombrar la nueva columna
ALTER TABLE "Product" RENAME COLUMN "productId_new" TO "productId";

-- Paso 6: Hacer que la columna sea NOT NULL
ALTER TABLE "Product" ALTER COLUMN "productId" SET NOT NULL;

-- Paso 7: Recrear el constraint único
ALTER TABLE "Product" ADD CONSTRAINT "Product_accountId_productId_key" UNIQUE ("accountId", "productId");

-- Paso 8: Eliminar la secuencia global si existe
DROP SEQUENCE IF EXISTS "Product_productId_seq";

-- Paso 9: Inicializar ProductSequence con el máximo productId de cada cuenta
INSERT INTO "ProductSequence" ("id", "accountId", "lastNumber", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid()::text,
  "accountId",
  COALESCE(MAX("productId"), 0) as "lastNumber",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Product"
GROUP BY "accountId"
ON CONFLICT ("accountId") DO NOTHING;

-- Paso 10: Asegurar que todas las cuentas tengan una ProductSequence (incluso sin productos)
INSERT INTO "ProductSequence" ("id", "accountId", "lastNumber", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid()::text,
  id as "accountId",
  0 as "lastNumber",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Account"
WHERE id NOT IN (SELECT "accountId" FROM "ProductSequence")
ON CONFLICT ("accountId") DO NOTHING;
