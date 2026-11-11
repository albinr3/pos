import { NextRequest, NextResponse } from "next/server"
import { cashRequest, cashDeviceHashFromRequest } from "@/lib/cash-context"
import { cashErrorResponse } from "@/lib/cash-http"
import { cancelPayment } from "@/app/(app)/ar/actions"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    if (!user.canCancelPayments && !user.isOwner) return NextResponse.json({ error: "No tienes permiso para cancelar pagos" }, { status: 403 })
    const body = await request.json().catch(() => ({}))
    const reason = String(body?.cancellationReason || body?.cancelReason || body?.reason || "").trim()
    if (!reason) return NextResponse.json({ error: "Debes indicar un motivo de cancelación" }, { status: 400 })
    const { id } = await params
    // Web y móvil deben usar el mismo cálculo para conservar devoluciones y créditos previos.
    const result = await cashRequest.run({ trustedActor: user, deviceHash: cashDeviceHashFromRequest(request) }, () => cancelPayment(id, reason))
    return NextResponse.json(result)
  } catch (error) {
    const cashFailure = cashErrorResponse(error)
    if (cashFailure) return cashFailure
    const message = error instanceof Error ? error.message : "Error al cancelar pago"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
