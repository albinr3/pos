import { NextRequest } from "next/server"
import { getCurrentUser, getClerkUserIdFromToken, getSubUserSession } from "@/lib/auth"

/**
 * Helper para obtener el usuario actual desde un request
 * Lee el token JWT del header X-SubUser-Token (para móvil) o de cookies (para web)
 * Para móvil, también verifica el token de Clerk desde Authorization o X-Clerk-Authorization
 */
export async function getCurrentUserFromRequest(request: NextRequest) {
  const subUserToken = request.headers.get("X-SubUser-Token")
  
  // Si hay token de subusuario pero no hay sesión de Clerk activa,
  // intentar obtener el token de Clerk desde los headers
  let authHeader = 
    request.headers.get("X-Clerk-Authorization") || 
    request.headers.get("x-clerk-authorization") ||
    request.headers.get("Authorization") || 
    request.headers.get("authorization")

  // Si hay authHeader, verificar el clerkUserId
  if (authHeader && subUserToken) {
    const clerkUserId = await getClerkUserIdFromToken(authHeader)

    if (!clerkUserId) {
      return null
    }
    
    // Validar que el subUserToken corresponde a una cuenta válida
    const session = await getSubUserSession(subUserToken)

    if (!session) {
      return null
    }
    
    // Obtener el usuario completo de la base de datos
    const prisma = (await import("@/lib/db")).prisma
    const user = await prisma.user.findFirst({
      where: {
        id: session.userId,
        accountId: session.accountId,
      },
    })
    
    if (!user) {
      return null
    }

    return {
      id: user.id,
      accountId: user.accountId,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      isOwner: user.isOwner,
      canAccessSales: user.canAccessSales,
      canAccessDashboard: user.canAccessDashboard,
      canAccessReturns: user.canAccessReturns,
      canAccessProducts: user.canAccessProducts,
      canAccessAccountsReceivable: user.canAccessAccountsReceivable,
      canAccessPayments: user.canAccessPayments,
      canAccessDailyClose: user.canAccessDailyClose,
      canAccessReports: user.canAccessReports,
      canAccessShippingLabels: user.canAccessShippingLabels,
      canAccessBilling: user.canAccessBilling,
      canAccessSettings: user.canAccessSettings,
      canOverridePrice: user.canOverridePrice,
      canCancelSales: user.canCancelSales,
      canCancelReturns: user.canCancelReturns,
      canCancelPayments: user.canCancelPayments,
      canEditSales: user.canEditSales,
      canEditProducts: user.canEditProducts,
      canChangeSaleType: user.canChangeSaleType,
      canSellWithoutStock: user.canSellWithoutStock,
      canManageBackups: user.canManageBackups,
      canViewProductCosts: user.canViewProductCosts,
      canViewProfitReport: user.canViewProfitReport,
      canAdjustInventory: user.canAdjustInventory,
      canManageCategories: user.canManageCategories,
      canManagePurchases: user.canManagePurchases,
      canCancelPurchases: user.canCancelPurchases,
      canManageSuppliers: user.canManageSuppliers,
      canManageCustomers: user.canManageCustomers,
      canApproveCredit: user.canApproveCredit,
      canManageExpenses: user.canManageExpenses,
      canCancelExpenses: user.canCancelExpenses,
      canManageQuotes: user.canManageQuotes,
      canApplyDiscounts: user.canApplyDiscounts,
      canViewAuditLogs: user.canViewAuditLogs,
      canManageUsers: user.canManageUsers,
      canManageSettings: user.canManageSettings,
      canViewTreasury: user.canViewTreasury,
      canManageTreasuryAccounts: user.canManageTreasuryAccounts,
      canCreateTreasuryTransfers: user.canCreateTreasuryTransfers,
      canReverseTreasuryTransfers: user.canReverseTreasuryTransfers,
    }
  }
  // Si no hay headers de Clerk, usar el método normal (para web)
  return await getCurrentUser(subUserToken)
}
