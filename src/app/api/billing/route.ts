import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import {
  getBillingSubscription,
  getBillingProfile,
  getBillingState,
  getPaymentHistory,
  getBankAccounts,
} from "@/lib/billing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/billing - Resumen completo de facturación para mobile/web
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const [subscription, profile, state, payments, bankAccounts] = await Promise.all([
      getBillingSubscription(user.accountId),
      getBillingProfile(user.accountId),
      getBillingState(user.accountId),
      getPaymentHistory(user.accountId),
      getBankAccounts(),
    ])

    return NextResponse.json({
      subscription,
      profile,
      state,
      payments,
      bankAccounts,
    })
  } catch (error: any) {
    console.error("Error en GET /api/billing:", error)
    return NextResponse.json(
      { error: error?.message || "Error al obtener facturación" },
      { status: 500 }
    )
  }
}
