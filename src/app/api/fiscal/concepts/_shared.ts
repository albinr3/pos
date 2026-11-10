import { NextResponse } from "next/server"
import { FiscalConceptError } from "@/lib/fiscal/core/concepts"
import { FiscalMasterDataError } from "@/lib/fiscal/core/master-data"

export function conceptError(error: unknown, correlationId: string) {
  const known = error instanceof FiscalConceptError || error instanceof FiscalMasterDataError
  const status = error instanceof FiscalConceptError ? error.status : error instanceof FiscalMasterDataError ? 400 : 500
  if (!known) console.error("Error de conceptos fiscales", correlationId, error)
  return NextResponse.json({ error: { code: error instanceof FiscalConceptError ? error.code : known ? "INVALID_INPUT" : "INTERNAL_ERROR", message: known ? error.message : "No se pudo procesar el concepto", fields: error instanceof FiscalMasterDataError ? [error.field] : [], retryable: !known, correlationId } }, { status })
}
export async function readConceptBody(request: Request) {
  try { return await request.json() } catch { throw new FiscalMasterDataError("JSON inválido", "body") }
}
