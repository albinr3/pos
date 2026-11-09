import { NextRequest, NextResponse } from "next/server"
import {
  getOrCreateAccount,
  authenticateSubUser,
  createSubUserSession,
} from "@/lib/auth"

import { corsHeaders, requestClerkUserId } from "@/lib/mobile-clerk-auth"
import { isAccountIdentityDeleted } from "@/lib/account-deletion-guard"

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: corsHeaders }) }

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/auth/subuser/login - Autenticar subusuario y obtener token JWT
export async function POST(request: NextRequest) {
  try {
    const clerkUserId = await requestClerkUserId(request)
    if (!clerkUserId) return NextResponse.json({ error: "No autenticado con Clerk" }, { status: 401, headers: corsHeaders })
    if (await isAccountIdentityDeleted(clerkUserId)) return NextResponse.json({ error: "Esta cuenta fue eliminada." }, { status: 410, headers: corsHeaders })

    // Obtener o crear Account usando el clerkUserId obtenido
    const account = await getOrCreateAccount(clerkUserId)
    if (!account) {
      // La baja puede confirmarse entre la comprobación inicial y la lectura de la cuenta.
      const deleted = await isAccountIdentityDeleted(clerkUserId)
      return NextResponse.json({ error: deleted ? "Esta cuenta fue eliminada." : "Error al obtener cuenta" }, { status: deleted ? 410 : 500, headers: corsHeaders })
    }

    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username y password son requeridos" },
        { status: 400, headers: corsHeaders }
      )
    }

    // Autenticar subusuario
    const result = await authenticateSubUser(account.id, username, password)

    if (!result.success || !result.user) {
      return NextResponse.json(
        { error: result.error || "Error de autenticación" },
        { status: 401, headers: corsHeaders }
      )
    }

    // Crear token JWT
    const token = await createSubUserSession(account.id, result.user.id)

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: result.user.id,
        accountId: result.user.accountId,
        username: result.user.username,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        isOwner: result.user.isOwner,
        canAccessSales: result.user.canAccessSales,
        canAccessDashboard: result.user.canAccessDashboard,
        canAccessReturns: result.user.canAccessReturns,
        canAccessProducts: result.user.canAccessProducts,
        canAccessAccountsReceivable: result.user.canAccessAccountsReceivable,
        canAccessPayments: result.user.canAccessPayments,
        canAccessDailyClose: result.user.canAccessDailyClose,
        canAccessReports: result.user.canAccessReports,
        canAccessShippingLabels: result.user.canAccessShippingLabels,
        canAccessBilling: result.user.canAccessBilling,
        canAccessSettings: result.user.canAccessSettings,
        canOverridePrice: result.user.canOverridePrice,
        canCancelSales: result.user.canCancelSales,
        canCancelReturns: result.user.canCancelReturns,
        canCancelPayments: result.user.canCancelPayments,
        canEditSales: result.user.canEditSales,
        canEditProducts: result.user.canEditProducts,
        canChangeSaleType: result.user.canChangeSaleType,
        canSellWithoutStock: result.user.canSellWithoutStock,
        canManageBackups: result.user.canManageBackups,
        canViewProductCosts: result.user.canViewProductCosts,
        canViewProfitReport: result.user.canViewProfitReport,
        canAdjustInventory: result.user.canAdjustInventory,
        canManageCategories: result.user.canManageCategories,
        canAccessAccountsPayable: result.user.canAccessAccountsPayable,
        canRegisterSupplierPayments: result.user.canRegisterSupplierPayments,
        canCancelSupplierPayments: result.user.canCancelSupplierPayments,
        canManagePurchases: result.user.canManagePurchases,
        canCancelPurchases: result.user.canCancelPurchases,
        canManageSuppliers: result.user.canManageSuppliers,
        canManageCustomers: result.user.canManageCustomers,
        canApproveCredit: result.user.canApproveCredit,
        canManageExpenses: result.user.canManageExpenses,
        canCancelExpenses: result.user.canCancelExpenses,
        canManageQuotes: result.user.canManageQuotes,
        canApplyDiscounts: result.user.canApplyDiscounts,
        canViewAuditLogs: result.user.canViewAuditLogs,
        canManageUsers: result.user.canManageUsers,
        canManageSettings: result.user.canManageSettings,
        canViewTreasury: result.user.canViewTreasury,
        canManageTreasuryAccounts: result.user.canManageTreasuryAccounts,
        canCreateTreasuryTransfers: result.user.canCreateTreasuryTransfers,
        canReverseTreasuryTransfers: result.user.canReverseTreasuryTransfers,
        canOperateCashShifts: result.user.canOperateCashShifts,
        canViewAllCashShifts: result.user.canViewAllCashShifts,
        canManageCashShifts: result.user.canManageCashShifts,
        canRecordCashMovements: result.user.canRecordCashMovements,
        canManageFiscalSettings: result.user.canManageFiscalSettings,
        canManageFiscalSequences: result.user.canManageFiscalSequences,
        canPrepareFiscalDocuments: result.user.canPrepareFiscalDocuments,
        canViewFiscalDocuments: result.user.canViewFiscalDocuments,
      },
    }, { headers: corsHeaders })
  } catch (error: any) {
    console.error("Error en POST /api/auth/subuser/login:", error)
    return NextResponse.json(
      { error: error.message || "Error al autenticar subusuario" },
      { status: 500, headers: corsHeaders }
    )
  }
}
