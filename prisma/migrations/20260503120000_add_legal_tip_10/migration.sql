-- Configuración global para habilitar propina legal del 10%
ALTER TABLE "CompanySettings"
ADD COLUMN "legalTipEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Snapshot de propina legal por factura de venta
ALTER TABLE "Sale"
ADD COLUMN "legalTipApplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "legalTipPercentBp" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN "legalTipBaseCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "legalTipCents" INTEGER NOT NULL DEFAULT 0;

-- Snapshot de propina legal reversada por devolución
ALTER TABLE "Return"
ADD COLUMN "legalTipCents" INTEGER NOT NULL DEFAULT 0;
