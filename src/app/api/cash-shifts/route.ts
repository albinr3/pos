import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { cashHash } from "@/lib/cash-context"
import { cashErrorResponse } from "@/lib/cash-http"
import { activateCashControl, cancelCashClose, correctClosedCashDocument, disableCashControl, finishCashClose, getCashContext, getCashShiftReport, listCashHistory, manualCashMovement, openCashShift, prepareCashClose, previewCashActivation } from "@/lib/cash-shifts"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
function failed(error: unknown) {
  return cashErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo procesar la caja" }, { status: 400 })
}
export async function GET(request: NextRequest) {
  try {
    const actor = await getCurrentUserFromRequest(request)
    if (!actor) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const token = request.cookies.get("movopos-cash-device")?.value ?? randomUUID()
    const action = request.nextUrl.searchParams.get("view")
    const data = action === "preview" ? await previewCashActivation(actor) : action === "history" ? await listCashHistory(actor, request.nextUrl.searchParams.get("before") ?? undefined, Number(request.nextUrl.searchParams.get("limit")) || undefined) : action === "report" ? await getCashShiftReport(actor, cashHash(token), request.nextUrl.searchParams.get("shiftId") ?? "") : await getCashContext(actor, cashHash(token))
    const response = NextResponse.json(data)
    response.headers.set("Cache-Control", "no-store")
    if (!request.cookies.has("movopos-cash-device")) response.cookies.set("movopos-cash-device", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 })
    return response
  } catch (error) { return failed(error) }
}
export async function POST(request: NextRequest) {
  try {
    // Las mutaciones con cookie verifican origen; no aceptar formularios enviados por otros sitios.
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 })
    const actor = await getCurrentUserFromRequest(request)
    if (!actor) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const token = request.cookies.get("movopos-cash-device")?.value
    const deviceHash = token ? cashHash(token) : ""
    const body = await request.json()
    let data: unknown = null
    switch (body.action) {
      case "activate": data = await activateCashControl(actor, body); break
      case "disable": data = await disableCashControl(actor); break
      case "open": data = await openCashShift(actor, deviceHash, body.countedCents, body.note); break
      case "prepare": data = await prepareCashClose(actor, deviceHash, body.shiftId, body.finalSequence); break
      case "resume": data = await cancelCashClose(actor, deviceHash, body.shiftId); break
      case "close": data = await finishCashClose(actor, deviceHash, body.shiftId, { ...body, emergency: false }); break
      case "emergency": data = await finishCashClose(actor, deviceHash, body.shiftId, { ...body, emergency: true }); break
      case "movement": data = await manualCashMovement(actor, deviceHash, body); break
      case "correct": data = await correctClosedCashDocument(actor, deviceHash, body); break
      default: return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
    }
    // El dinero ya está confirmado: una falla de caché no debe responder como si el movimiento hubiera fallado.
    try { revalidatePath("/daily-close"); revalidatePath("/treasury"); revalidatePath("/settings") }
    catch (error) { console.error("[cash-shifts] No se pudo actualizar la caché después del commit", error) }
    return NextResponse.json({ ok: true, data })
  } catch (error) { return failed(error) }
}
