import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { getBillingState, getBillingSubscription } from "@/lib/billing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const [state, subscription] = await Promise.all([
      getBillingState(user.accountId),
      getBillingSubscription(user.accountId),
    ])

    return NextResponse.json({
      status: state.status,
      isTrialing: state.isTrialing,
      trialDaysRemaining: state.trialDaysRemaining,
      daysRemaining: state.daysRemaining,
      canAccessApp: state.canAccessApp,
      needsPayment: state.needsPayment,
      trialEndsAt: subscription?.trialEndsAt ?? null,
    })
  } catch (error: any) {
    console.error("Error en GET /api/billing/state:", error)
    return NextResponse.json(
      { error: error?.message || "Error al obtener estado de billing" },
      { status: 500 }
    )
  }
}

