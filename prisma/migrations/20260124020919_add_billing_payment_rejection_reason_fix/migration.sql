-- AlterTable
ALTER TABLE "BillingPayment" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "BillingSubscription" ALTER COLUMN "priceUsdCents" SET DEFAULT 2000;
