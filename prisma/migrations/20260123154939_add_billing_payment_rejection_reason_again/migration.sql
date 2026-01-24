-- Add rejection reason to billing payments (re-run for prod, guard if table not created yet)
DO $$
BEGIN
  IF to_regclass('public."BillingPayment"') IS NOT NULL THEN
    ALTER TABLE "BillingPayment"
      ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
  END IF;
END
$$;
