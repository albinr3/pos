/*
  Warnings:

  - Added the required column `receiptCode` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `receiptNumber` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/

-- Paso 1: Crear la tabla PaymentSequence
CREATE TABLE "PaymentSequence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSequence_accountId_key" ON "PaymentSequence"("accountId");

-- CreateIndex
CREATE INDEX "PaymentSequence_accountId_idx" ON "PaymentSequence"("accountId");

-- AddForeignKey
ALTER TABLE "PaymentSequence" ADD CONSTRAINT "PaymentSequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Paso 2: Agregar columnas con valores temporales para pagos existentes
ALTER TABLE "Payment" ADD COLUMN "receiptNumber" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "receiptCode" TEXT;

-- Paso 3: Asignar números de recibo a pagos existentes por cuenta
-- Usamos ROW_NUMBER() para generar secuencias por accountId ordenados por fecha de pago
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Payment" LIMIT 1) THEN
    WITH numbered_payments AS (
      SELECT 
        p.id,
        ROW_NUMBER() OVER (PARTITION BY s."accountId" ORDER BY p."paidAt", p."createdAt") as row_num,
        s."accountId"
      FROM "Payment" p
      INNER JOIN "AccountReceivable" ar ON p."arId" = ar.id
      INNER JOIN "Sale" s ON ar."saleId" = s.id
    )
    UPDATE "Payment" p
    SET 
      "receiptNumber" = np.row_num,
      "receiptCode" = 'R-' || LPAD(np.row_num::TEXT, 6, '0')
    FROM numbered_payments np
    WHERE p.id = np.id;
  END IF;
END $$;

-- Paso 4: Inicializar PaymentSequence para cada cuenta con el máximo número usado
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Payment" LIMIT 1) THEN
    INSERT INTO "PaymentSequence" ("id", "createdAt", "updatedAt", "accountId", "lastNumber")
    SELECT 
      gen_random_uuid()::TEXT,
      NOW(),
      NOW(),
      s."accountId",
      COALESCE(MAX(p."receiptNumber"), 0)
    FROM "Payment" p
    INNER JOIN "AccountReceivable" ar ON p."arId" = ar.id
    INNER JOIN "Sale" s ON ar."saleId" = s.id
    GROUP BY s."accountId"
    ON CONFLICT ("accountId") DO NOTHING;
  END IF;
END $$;

-- Paso 5: Hacer las columnas NOT NULL
ALTER TABLE "Payment" ALTER COLUMN "receiptNumber" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "receiptCode" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Payment_receiptCode_idx" ON "Payment"("receiptCode");
