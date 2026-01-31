-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "showItbisOnReceipts" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "chargesItbis" BOOLEAN NOT NULL DEFAULT false;
