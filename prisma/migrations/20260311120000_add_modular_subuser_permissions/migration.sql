-- Add modular sub-user permissions
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "canAdjustInventory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageCategories" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManagePurchases" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canCancelPurchases" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageSuppliers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageCustomers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canApproveCredit" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageExpenses" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canCancelExpenses" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageQuotes" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canApplyDiscounts" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canViewAuditLogs" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageUsers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageSettings" BOOLEAN NOT NULL DEFAULT false;

-- Compatibility backfill: owners keep full access
UPDATE "User"
SET
  "canAdjustInventory" = true,
  "canManageCategories" = true,
  "canManagePurchases" = true,
  "canCancelPurchases" = true,
  "canManageSuppliers" = true,
  "canManageCustomers" = true,
  "canApproveCredit" = true,
  "canManageExpenses" = true,
  "canCancelExpenses" = true,
  "canManageQuotes" = true,
  "canApplyDiscounts" = true,
  "canViewAuditLogs" = true,
  "canManageUsers" = true,
  "canManageSettings" = true
WHERE "isOwner" = true;

-- Compatibility backfill: non-owners keep current operational access
UPDATE "User"
SET
  "canAdjustInventory" = "canEditProducts",
  "canManageCategories" = "canEditProducts",
  "canManagePurchases" = true,
  "canCancelPurchases" = true,
  "canManageSuppliers" = true,
  "canManageCustomers" = true,
  "canApproveCredit" = true,
  "canManageExpenses" = true,
  "canCancelExpenses" = true,
  "canManageQuotes" = true,
  "canApplyDiscounts" = true,
  "canViewAuditLogs" = false,
  "canManageUsers" = false,
  "canManageSettings" = true
WHERE "isOwner" = false;