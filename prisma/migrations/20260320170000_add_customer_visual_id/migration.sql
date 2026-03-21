-- CreateTable
CREATE TABLE "CustomerSequence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CustomerSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSequence_accountId_key" ON "CustomerSequence"("accountId");

-- CreateIndex
CREATE INDEX "CustomerSequence_accountId_idx" ON "CustomerSequence"("accountId");

-- AddForeignKey
ALTER TABLE "CustomerSequence"
ADD CONSTRAINT "CustomerSequence_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn
ALTER TABLE "Customer" ADD COLUMN "id_visual" INTEGER;

-- Normalizar múltiples clientes genéricos por cuenta: solo uno permanece como isGeneric=true
WITH ranked_generics AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "accountId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Customer"
  WHERE "isGeneric" = true
)
UPDATE "Customer" c
SET "isGeneric" = false
FROM ranked_generics rg
WHERE c."id" = rg."id"
  AND rg.rn > 1;

-- Garantizar cliente genérico por cuenta
INSERT INTO "Customer" (
  "id",
  "createdAt",
  "updatedAt",
  "accountId",
  "name",
  "isGeneric",
  "isActive",
  "creditEnabled",
  "creditDays"
)
SELECT
  gen_random_uuid()::text,
  NOW(),
  NOW(),
  a."id",
  'Cliente general',
  true,
  true,
  false,
  0
FROM "Account" a
WHERE NOT EXISTS (
  SELECT 1
  FROM "Customer" c
  WHERE c."accountId" = a."id"
    AND c."isGeneric" = true
);

-- Uniformar nombre/estado del cliente genérico canónico
UPDATE "Customer"
SET
  "name" = 'Cliente general',
  "isActive" = true
WHERE "isGeneric" = true;

-- Asignar visualId=1 al cliente genérico canónico por cuenta
WITH canonical_generics AS (
  SELECT DISTINCT ON ("accountId")
    "id",
    "accountId"
  FROM "Customer"
  WHERE "isGeneric" = true
  ORDER BY "accountId", "createdAt" ASC, "id" ASC
)
UPDATE "Customer" c
SET "id_visual" = 1
FROM canonical_generics cg
WHERE c."id" = cg."id";

-- Asignar visualId consecutivo al resto (2..n) por cuenta
WITH canonical_generics AS (
  SELECT DISTINCT ON ("accountId")
    "id",
    "accountId"
  FROM "Customer"
  WHERE "isGeneric" = true
  ORDER BY "accountId", "createdAt" ASC, "id" ASC
),
ranked_rest AS (
  SELECT
    c."id",
    c."accountId",
    ROW_NUMBER() OVER (PARTITION BY c."accountId" ORDER BY c."createdAt" ASC, c."id" ASC) AS rn
  FROM "Customer" c
  LEFT JOIN canonical_generics cg ON cg."id" = c."id"
  WHERE cg."id" IS NULL
)
UPDATE "Customer" c
SET "id_visual" = rr.rn + 1
FROM ranked_rest rr
WHERE c."id" = rr."id";

-- Fallback defensivo por si queda algún null
WITH current_max AS (
  SELECT
    "accountId",
    COALESCE(MAX("id_visual"), 0) AS max_visual
  FROM "Customer"
  GROUP BY "accountId"
),
ranked_nulls AS (
  SELECT
    c."id",
    c."accountId",
    ROW_NUMBER() OVER (PARTITION BY c."accountId" ORDER BY c."createdAt" ASC, c."id" ASC) AS rn
  FROM "Customer" c
  WHERE c."id_visual" IS NULL
)
UPDATE "Customer" c
SET "id_visual" = cm.max_visual + rn.rn
FROM ranked_nulls rn
JOIN current_max cm ON cm."accountId" = rn."accountId"
WHERE c."id" = rn."id";

-- Inicializar secuencia por cuenta con el máximo visualId actual
INSERT INTO "CustomerSequence" ("id", "createdAt", "updatedAt", "accountId", "lastNumber")
SELECT
  gen_random_uuid()::text,
  NOW(),
  NOW(),
  a."id",
  COALESCE(MAX(c."id_visual"), 0) AS "lastNumber"
FROM "Account" a
LEFT JOIN "Customer" c ON c."accountId" = a."id"
GROUP BY a."id"
ON CONFLICT ("accountId")
DO UPDATE SET
  "lastNumber" = EXCLUDED."lastNumber",
  "updatedAt" = NOW();

-- Enforcements finales
ALTER TABLE "Customer" ALTER COLUMN "id_visual" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_accountId_id_visual_key" ON "Customer"("accountId", "id_visual");

-- Enable RLS for CustomerSequence (consistencia con tablas de secuencia)
ALTER TABLE "CustomerSequence" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'service_role'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'CustomerSequence'
      AND policyname = 'Service role full access'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "CustomerSequence" FOR ALL TO service_role USING (true) WITH CHECK (true);';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'postgres'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'CustomerSequence'
      AND policyname = 'Postgres full access'
  ) THEN
    EXECUTE 'CREATE POLICY "Postgres full access" ON "CustomerSequence" FOR ALL TO postgres USING (true) WITH CHECK (true);';
  END IF;
END
$$;
