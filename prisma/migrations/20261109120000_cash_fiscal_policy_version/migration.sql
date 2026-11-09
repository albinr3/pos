-- Los registros históricos no tenían una versión fiscal verificable; no inferirla.
ALTER TABLE "CashOperation" ADD COLUMN "fiscalPolicyVersion" INTEGER;
