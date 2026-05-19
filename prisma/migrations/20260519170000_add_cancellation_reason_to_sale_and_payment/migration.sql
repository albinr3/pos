-- Requerido para auditoría: guardar motivo al cancelar facturas y recibos.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
