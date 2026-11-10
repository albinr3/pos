import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { FiscalSettingsError, getFiscalSettings, updateFiscalSettings } from "@/lib/fiscal/core/settings"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
async function handle(request: NextRequest, write: boolean) {
  const correlationId = crypto.randomUUID()
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) throw new FiscalSettingsError("UNAUTHENTICATED", "No autenticado", 401)
    let body: unknown
    if (write) { try { body = await request.json() } catch { throw new FiscalSettingsError("INVALID_INPUT", "JSON inválido", 400) } }
    const result = write ? await updateFiscalSettings(user, body) : await getFiscalSettings(user)
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const known = error instanceof FiscalSettingsError
    if (!known) console.error("Error de configuración fiscal", correlationId, error)
    return NextResponse.json({ error: { code: known ? error.code : "INTERNAL_ERROR", message: known ? error.message : "No se pudo procesar la configuración", fields: known ? error.fields : [], retryable: !known, correlationId } }, { status: known ? error.status : 500 })
  }
}
export async function GET(request: NextRequest) { return handle(request, false) }
export async function PUT(request: NextRequest) { return handle(request, true) }
