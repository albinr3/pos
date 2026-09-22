-- Preferencia única para comunicaciones de seguimiento; los correos transaccionales no la usan.
ALTER TABLE "Account" ADD COLUMN "engagementEmailsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Las filas históricas no necesitan una clave: solo se reserva para envíos nuevos.
ALTER TABLE "BillingNotification" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "BillingNotification_dedupeKey_key"
ON "BillingNotification"("dedupeKey");
