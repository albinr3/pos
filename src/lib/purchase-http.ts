import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "@/app/api/_helpers/auth"
import { cashHash, cashRequest } from "@/lib/cash-context"
import { cashErrorResponse } from "@/lib/cash-http"
import { PurchaseError, type PurchaseActor } from "@/lib/purchase-credit"

export async function purchaseAPI(request: NextRequest, run: (actor: PurchaseActor) => Promise<unknown>) {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin")
      if (origin && origin !== request.nextUrl.origin) throw new PurchaseError("FORBIDDEN_ORIGIN", "Origen no permitido", 403)
    }
    const actor = await getCurrentUserFromRequest(request)
    if (!actor) throw new PurchaseError("UNAUTHENTICATED", "No autenticado", 401)
    const token = request.cookies.get("movopos-cash-device")?.value
    // El actor procede de los tokens verificados, nunca de accountId/userId enviados por el cliente.
    const result = await cashRequest.run({ trustedActor: actor, deviceHash: token ? cashHash(token) : "" }, () => run(actor))
    // Las fechas de vencimiento son fechas de calendario, incluso dentro de objetos anidados.
    const serialized = result instanceof Response ? result : JSON.parse(JSON.stringify(result, (key, value) => key === "dueDate" && typeof value === "string" ? value.slice(0, 10) : value))
    return serialized instanceof Response ? serialized : NextResponse.json(serialized, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const cashFailure = cashErrorResponse(error)
    if (cashFailure) return cashFailure
    if (error instanceof PurchaseError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    if (error instanceof SyntaxError) return NextResponse.json({ error: "JSON inválido", code: "INVALID_JSON" }, { status: 400 })
    if (error instanceof Error && error.message.includes("No tienes permiso")) return NextResponse.json({ error: error.message, code: "FORBIDDEN" }, { status: 403 })
    console.error("[purchase-api]", error)
    return NextResponse.json({ error: "No se pudo procesar la operación", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
export async function purchaseBody<T>(request: NextRequest): Promise<T> {
  const data = await request.json()
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new PurchaseError("INVALID_BODY", "Envía un objeto JSON")
  return data as T
}
export function purchaseFilters(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams)
  return { ...params, from: params.from, to: params.to, skip: params.skip === undefined ? undefined : Number(params.skip), take: params.take === undefined ? undefined : Number(params.take) }
}
