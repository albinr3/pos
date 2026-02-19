import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import { getBillingProfile, getLemonCheckoutUrl } from "@/lib/billing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function resolveCheckoutResponse(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 })
  }

  const profile = await getBillingProfile(user.accountId)
  const url = await getLemonCheckoutUrl(user.accountId, profile?.email)

  return NextResponse.json({ success: true, url })
}

// GET /api/billing/checkout/usd - URL de checkout Lemon Squeezy
export async function GET(request: NextRequest) {
  try {
    return await resolveCheckoutResponse(request)
  } catch (error: any) {
    console.error("Error en GET /api/billing/checkout/usd:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Error al obtener URL de pago. Verifica configuración de Lemon Squeezy.",
      },
      { status: 500 }
    )
  }
}

// POST /api/billing/checkout/usd - Alias para clientes que usan POST
export async function POST(request: NextRequest) {
  try {
    return await resolveCheckoutResponse(request)
  } catch (error: any) {
    console.error("Error en POST /api/billing/checkout/usd:", error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Error al obtener URL de pago. Verifica configuración de Lemon Squeezy.",
      },
      { status: 500 }
    )
  }
}
