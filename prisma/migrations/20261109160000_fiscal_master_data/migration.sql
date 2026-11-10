-- Datos opcionales: no se interpreta el tratamiento de los registros históricos.
ALTER TABLE "Customer" ADD COLUMN "fiscalIdentificationType" TEXT, ADD COLUMN "fiscalIdentificationCountry" TEXT, ADD COLUMN "fiscalIdentification" TEXT, ADD COLUMN "fiscalLegalName" TEXT, ADD COLUMN "fiscalEmail" TEXT, ADD COLUMN "fiscalAddress" TEXT, ADD COLUMN "fiscalPreferredReceiptType" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "fiscalIdentificationType" TEXT, ADD COLUMN "fiscalIdentificationCountry" TEXT, ADD COLUMN "fiscalIdentification" TEXT, ADD COLUMN "fiscalResidence" TEXT, ADD COLUMN "fiscalLegalName" TEXT, ADD COLUMN "fiscalDeclaredCondition" TEXT;
ALTER TABLE "Product" ADD COLUMN "fiscalItemType" TEXT, ADD COLUMN "fiscalUnit" TEXT, ADD COLUMN "fiscalTaxTreatment" TEXT;
CREATE TABLE "FiscalConcept" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "name" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "fiscalUnit" TEXT, "fiscalTaxTreatment" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalConcept_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FiscalConcept_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FiscalConcept_accountId_isActive_idx" ON "FiscalConcept"("accountId", "isActive");
