-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "creditDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creditEnabled" BOOLEAN NOT NULL DEFAULT false;
