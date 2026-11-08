-- Las cuentas existentes conservan apertura manual; solo las nuevas altas optan al inicio automático.
ALTER TABLE "AccountOnboarding" ADD COLUMN "mobileAutoStartEligible" BOOLEAN NOT NULL DEFAULT false;
