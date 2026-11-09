ALTER TABLE "User" ADD COLUMN "canManageFiscalSettings" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canManageFiscalSequences" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canPrepareFiscalDocuments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canViewFiscalDocuments" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "FiscalSettings" (
  "accountId" TEXT NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "jurisdiction" TEXT,
  "regime" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'TEST',
  "configurationStatus" TEXT NOT NULL DEFAULT 'INCOMPLETE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalSettings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "FiscalPolicyChange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "actorUserId" TEXT,
  "policy" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalPolicyChange_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalPolicyChange_accountId_version_key" ON "FiscalPolicyChange"("accountId", "version");
