import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import { exportFiscalHistory } from "@/lib/fiscal/core/history-export"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  const errorResponse = (status: number, code: string, message: string, retryable = false) =>
    NextResponse.json({ error: { code, message, fields: [], retryable, correlationId } }, { status, headers: { "Cache-Control": "private, no-store" } })
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return errorResponse(401, "UNAUTHENTICATED", "No autenticado")
    if (!user.isOwner) return errorResponse(403, "FORBIDDEN", "Solo el dueño puede exportar el historial fiscal")
    const history = await exportFiscalHistory(user.accountId)
    // Las secuencias BigInt se envían como texto para no perder precisión en móvil.
    const body = JSON.stringify(history, (_key, value) => typeof value === "bigint" ? value.toString() : value)
    return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=historial-fiscal.json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) {
    console.error("No se pudo exportar el historial fiscal", correlationId, error)
    return errorResponse(500, "INTERNAL_ERROR", "No se pudo exportar el historial fiscal", true)
  }
}
