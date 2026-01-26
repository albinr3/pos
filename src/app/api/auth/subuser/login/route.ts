import { NextRequest, NextResponse } from "next/server"
import {
  getClerkUserId,
  getOrCreateAccount,
  authenticateSubUser,
  createSubUserSession,
} from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/auth/subuser/login - Autenticar subusuario y obtener token JWT
export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación de Clerk
    const clerkUserId = await getClerkUserId()
    if (!clerkUserId) {
      return NextResponse.json({ error: "No autenticado con Clerk" }, { status: 401 })
    }

    // Obtener o crear Account
    const account = await getOrCreateAccount()
    if (!account) {
      return NextResponse.json({ error: "Error al obtener cuenta" }, { status: 500 })
    }

    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username y password son requeridos" },
        { status: 400 }
      )
    }

    // Autenticar subusuario
    const result = await authenticateSubUser(account.id, username, password)

    if (!result.success || !result.user) {
      return NextResponse.json(
        { error: result.error || "Error de autenticación" },
        { status: 401 }
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
      },
    })
  } catch (error: any) {
    console.error("Error en POST /api/auth/subuser/login:", error)
    return NextResponse.json(
      { error: error.message || "Error al autenticar subusuario" },
      { status: 500 }
    )
  }
}
