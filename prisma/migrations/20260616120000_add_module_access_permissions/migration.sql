ALTER TABLE "User"
ADD COLUMN "canAccessSales" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessReturns" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessProducts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessAccountsReceivable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessPayments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessDailyClose" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessReports" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessShippingLabels" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessBilling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canAccessSettings" BOOLEAN NOT NULL DEFAULT false;

-- Estos módulos antes no tenían permiso de acceso y siempre aparecían.
-- El backfill conserva ese comportamiento para usuarios ya creados.
UPDATE "User"
SET
  "canAccessSales" = true,
  "canAccessDashboard" = true,
  "canAccessReturns" = true,
  "canAccessProducts" = true,
  "canAccessAccountsReceivable" = true,
  "canAccessPayments" = true,
  "canAccessDailyClose" = true,
  "canAccessReports" = true,
  "canAccessShippingLabels" = true,
  "canAccessBilling" = true,
  "canAccessSettings" = true;
