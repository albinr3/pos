-- Add rejection reason for manual payment rejections
ALTER TABLE "BillingPayment"
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
