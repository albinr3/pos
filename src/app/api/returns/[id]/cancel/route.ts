import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import { cancelReturn } from "@/app/(app)/returns/actions"
import { cashDeviceHashFromRequest, cashRequest } from "@/lib/cash-context"
import { cashErrorResponse } from "@/lib/cash-http"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const body = await request.json()
    const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
    if (!reason) return NextResponse.json({ error: "Indica el motivo de la reversión" }, { status: 400 })
    const { id } = await context.params
    const result = await cashRequest.run({ trustedActor: user, deviceHash: cashDeviceHashFromRequest(request) }, () => cancelReturn(id, reason))
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return cashErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo revertir la devolución" }, { status: 400 })
  }
}
