-- AlterTable: Add print format columns to CompanySettings
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "salePrintFormat" TEXT NOT NULL DEFAULT '80mm';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "quotePrintFormat" TEXT NOT NULL DEFAULT '80mm';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "paymentPrintFormat" TEXT NOT NULL DEFAULT '80mm';
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "returnPrintFormat" TEXT NOT NULL DEFAULT '80mm';
