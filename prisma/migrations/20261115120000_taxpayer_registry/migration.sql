-- Padrón compartido; las identificaciones son texto para conservar ceros iniciales.
CREATE TABLE "TaxpayerRegistry" (
  "identification" TEXT PRIMARY KEY,
  "legalName" TEXT NOT NULL
);
CREATE TABLE "TaxpayerRegistryImport" (
  "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "source" TEXT NOT NULL,
  "recordCount" INTEGER NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
