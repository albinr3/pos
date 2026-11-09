import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { getFiscalCapabilities } from "@/lib/fiscal/core/policy"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "No autenticado", fields: [], retryable: false, correlationId } }, { status: 401 })
    const capabilities = await getFiscalCapabilities(user)
    if (!capabilities) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Sin permiso fiscal", fields: [], retryable: false, correlationId } }, { status: 403 })
    return NextResponse.json(capabilities, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("Error al consultar capacidades fiscales", correlationId, error)
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "No se pudieron consultar las capacidades", fields: [], retryable: true, correlationId } }, { status: 500 })
  }
}
