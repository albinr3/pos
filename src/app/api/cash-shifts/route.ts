import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { cashDeviceHashFromRequest, cashHash } from "@/lib/cash-context"
import { cashErrorResponse } from "@/lib/cash-http"
import { activateCashControl, cancelCashClose, cancelPendingManualCashMovement, correctClosedCashDocument, disableCashControl, finishCashClose, getCashContext, getCashReceipt, getCashShiftReport, listCashHistory, manualCashMovement, openCashShift, prepareCashClose, previewCashActivation } from "@/lib/cash-shifts"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
function failed(error: unknown) {
  return cashErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo procesar la caja" }, { status: 400 })
}
export async function GET(request: NextRequest) {
  try {
    const actor = await getCurrentUserFromRequest(request)
    if (!actor) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const action = request.nextUrl.searchParams.get("view")
    if (action === "device") {
      // Solo el cliente móvil autenticado recibe el secreto una vez; la web sigue usando cookie httpOnly.
      if (!request.headers.has("x-subuser-token") || !(request.headers.has("x-clerk-authorization") || request.headers.has("authorization"))) return NextResponse.json({ error: "Cliente móvil no autenticado" }, { status: 403 })
      return NextResponse.json({ token: randomUUID(), deviceId: randomUUID() }, { headers: { "Cache-Control": "no-store" } })
    }
    const mobile = request.headers.has("x-subuser-token") && (request.headers.has("x-clerk-authorization") || request.headers.has("authorization"))
    const token = request.cookies.get("movopos-cash-device")?.value ?? randomUUID()
    // Un móvil sin su secreto no puede hacerse pasar por el dispositivo de una cookie web.
    const deviceHash = mobile ? cashDeviceHashFromRequest(request) : cashHash(token)
    const data = action === "preview" ? await previewCashActivation(actor) : action === "history" ? await listCashHistory(actor, request.nextUrl.searchParams.get("before") ?? undefined, Number(request.nextUrl.searchParams.get("limit")) || undefined) : action === "report" ? await getCashShiftReport(actor, deviceHash, request.nextUrl.searchParams.get("shiftId") ?? "") : action === "receipt" ? await getCashReceipt(actor, request.nextUrl.searchParams.get("shiftId") ?? "") : await getCashContext(actor, deviceHash)
    if (action === "receipt" && !data) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })
    const response = NextResponse.json(data)
    response.headers.set("Cache-Control", "no-store")
    if (!mobile && !request.cookies.has("movopos-cash-device")) response.cookies.set("movopos-cash-device", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 })
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
    const deviceHash = cashDeviceHashFromRequest(request)
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
      case "cancelMovement": data = await cancelPendingManualCashMovement(actor, deviceHash, body); break
      case "correct": data = await correctClosedCashDocument(actor, deviceHash, body); break
      default: return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
    }
    // El dinero ya está confirmado: una falla de caché no debe responder como si el movimiento hubiera fallado.
    try { revalidatePath("/daily-close"); revalidatePath("/treasury"); revalidatePath("/settings") }
    catch (error) { console.error("[cash-shifts] No se pudo actualizar la caché después del commit", error) }
    return NextResponse.json({ ok: true, data })
  } catch (error) { return failed(error) }
}
