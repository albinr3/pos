-- Add rejection reason to billing payments (re-run for prod)
ALTER TABLE "BillingPayment"
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;