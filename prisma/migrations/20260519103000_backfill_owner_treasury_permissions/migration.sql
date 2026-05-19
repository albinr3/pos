-- Backfill: asegurar permisos de tesorería activos para owners existentes
UPDATE "User"
SET
  "canViewTreasury" = true,
  "canManageTreasuryAccounts" = true,
  "canCreateTreasuryTransfers" = true,
  "canReverseTreasuryTransfers" = true
WHERE "isOwner" = true;
