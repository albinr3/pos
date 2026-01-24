-- Add rejection reason for manual payment rejections (guard if table not created yet)
DO $$
BEGIN
  IF to_regclass('public."BillingPayment"') IS NOT NULL THEN
    ALTER TABLE "BillingPayment"
      ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
  END IF;
END
$$;
