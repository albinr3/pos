ALTER TABLE "AccountOnboarding"
  ADD COLUMN "initialSetupStartedAt" TIMESTAMP(3),
  ADD COLUMN "initialSetupCompletedAt" TIMESTAMP(3);

ALTER TABLE "User"
  ADD COLUMN "hasTemporaryPin" BOOLEAN NOT NULL DEFAULT false;

-- Las cuentas históricas con cualquier usuario ya terminaron la configuración.
INSERT INTO "AccountOnboarding" ("accountId", "initialSetupStartedAt", "initialSetupCompletedAt", "createdAt", "updatedAt")
SELECT "accountId", MIN("createdAt"), MIN("createdAt"), NOW(), NOW()
FROM "User"
GROUP BY "accountId"
ON CONFLICT ("accountId") DO UPDATE
SET "initialSetupStartedAt" = COALESCE("AccountOnboarding"."initialSetupStartedAt", EXCLUDED."initialSetupStartedAt"),
    "initialSetupCompletedAt" = COALESCE("AccountOnboarding"."initialSetupCompletedAt", EXCLUDED."initialSetupCompletedAt");
