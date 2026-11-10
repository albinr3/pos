import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { FiscalSequenceError } from "@/lib/fiscal/core/sequences"

export async function actor(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request)
  if (!user) throw new FiscalSequenceError("UNAUTHENTICATED", "No autenticado", 401)
  return user
}
export async function body(request: NextRequest) {
  try { return await request.json() } catch { throw new FiscalSequenceError("INVALID_INPUT", "JSON inválido", 400, ["body"]) }
}
export function pagination(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("take") ?? "50", take = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(take) || take < 1 || take > 200) throw new FiscalSequenceError("INVALID_INPUT", "take debe estar entre 1 y 200", 400, ["take"])
  return { take, cursor: request.nextUrl.searchParams.get("cursor") || undefined }
}
export function ok(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } }) }
export function errorResponse(error: unknown) {
  const correlationId = crypto.randomUUID(), known = error instanceof FiscalSequenceError
  if (!known) console.error("Error de secuencias fiscales", correlationId, error)
  return NextResponse.json({ error: { code: known ? error.code : "INTERNAL_ERROR", message: known ? error.message : "No se pudo procesar la secuencia", fields: known ? error.fields : [], retryable: !known, correlationId } }, { status: known ? error.status : 500, headers: { "Cache-Control": "private, no-store" } })
}
