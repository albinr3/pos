// Auth stub: for now we assume a single local user.
// Later you can replace this with real auth (NextAuth/Auth.js) and roles/permissions.

export type CurrentUser = {
  username: string
  canAccessSales: boolean
  canAccessDashboard: boolean
  canAccessReturns: boolean
  canAccessProducts: boolean
  canAccessAccountsReceivable: boolean
  canAccessPayments: boolean
  canAccessDailyClose: boolean
  canAccessReports: boolean
  canAccessShippingLabels: boolean
  canAccessBilling: boolean
  canAccessSettings: boolean
  canOverridePrice: boolean
  canCancelSales: boolean
  canCancelReturns: boolean
  canCancelPayments: boolean
  canEditSales: boolean
  canEditProducts: boolean
  canChangeSaleType: boolean
  canSellWithoutStock: boolean
  canManageBackups: boolean
  canViewProductCosts: boolean
  canViewProfitReport: boolean
  canAdjustInventory: boolean
  canManageCategories: boolean
  canManagePurchases: boolean
  canCancelPurchases: boolean
  canManageSuppliers: boolean
  canManageCustomers: boolean
  canApproveCredit: boolean
  canManageExpenses: boolean
  canCancelExpenses: boolean
  canManageQuotes: boolean
  canApplyDiscounts: boolean
  canViewAuditLogs: boolean
  canManageUsers: boolean
  canManageSettings: boolean
  canViewTreasury: boolean
  canManageTreasuryAccounts: boolean
  canCreateTreasuryTransfers: boolean
  canReverseTreasuryTransfers: boolean
}

export function getCurrentUserStub(): CurrentUser {
  // TODO (enable later): derive from session
  // For now, admin has all permissions
  return {
    username: "admin",
    canAccessSales: true,
    canAccessDashboard: true,
    canAccessReturns: true,
    canAccessProducts: true,
    canAccessAccountsReceivable: true,
    canAccessPayments: true,
    canAccessDailyClose: true,
    canAccessReports: true,
    canAccessShippingLabels: true,
    canAccessBilling: true,
    canAccessSettings: true,
    canOverridePrice: true,
    canCancelSales: true,
    canCancelReturns: true,
    canCancelPayments: true,
    canEditSales: true,
    canEditProducts: true,
    canChangeSaleType: true,
    canSellWithoutStock: true,
    canManageBackups: true,
    canViewProductCosts: true,
    canViewProfitReport: true,
    canAdjustInventory: true,
    canManageCategories: true,
    canManagePurchases: true,
    canCancelPurchases: true,
    canManageSuppliers: true,
    canManageCustomers: true,
    canApproveCredit: true,
    canManageExpenses: true,
    canCancelExpenses: true,
    canManageQuotes: true,
    canApplyDiscounts: true,
    canViewAuditLogs: true,
    canManageUsers: true,
    canManageSettings: true,
    canViewTreasury: true,
    canManageTreasuryAccounts: true,
    canCreateTreasuryTransfers: true,
    canReverseTreasuryTransfers: true,
  }
}

/*
// Example (commented) for future:
// import { auth } from "@/auth"
// export async function getCurrentUser() {
//   const session = await auth()
//   return session?.user
// }
*/
