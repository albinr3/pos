import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import { previewFiscalDocument } from "@/lib/fiscal/core/preview"
import { FiscalDocumentError } from "@/lib/fiscal/core/document"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  try {
    const actor = await getCurrentUserFromRequest(request)
    if (!actor) throw new FiscalDocumentError("UNAUTHENTICATED", "No autenticado", 401)
    let input: unknown
    try { input = await request.json() } catch { throw new FiscalDocumentError("INVALID_INPUT", "JSON inválido", 400) }
    const result = await previewFiscalDocument(actor, input)
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const known = error instanceof FiscalDocumentError
    if (!known) console.error("Error de previsualización fiscal", correlationId, error)
    return NextResponse.json({ error: { code: known ? error.code : "INTERNAL_ERROR", message: known ? error.message : "No se pudo previsualizar", fields: known ? error.issues : [], retryable: !known, correlationId } }, { status: known ? error.status : 500 })
  }
}
