import { auth, verifyToken } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { getSubUserSession } from "@/lib/auth"
import { requestAccountDeletion, processAccountDeletion } from "@/lib/account-deletion"
import { checkRateLimit, getClientIdentifier, RateLimitError } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 120

export async function DELETE(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    // Las apps nativas no envían Origin; una web ajena no debe poder enviar esta operación con cookies.
    if ((origin && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ code: "INVALID_ORIGIN", error: "Origen no permitido." }, { status: 403 })
    }
    checkRateLimit(`account-delete:ip:${getClientIdentifier(request)}`, { windowMs: 15 * 60 * 1000, maxRequests: 30 })

    const bearer = request.headers.get("x-clerk-authorization") || request.headers.get("authorization")
    let clerkUserId: string | null = null
    if (bearer) {
      try {
        // La baja requiere verificar explícitamente firma, caducidad y sesión Clerk.
        const token = await verifyToken(bearer.replace(/^Bearer\s+/i, ""), {
          secretKey: process.env.CLERK_SECRET_KEY,
          jwtKey: process.env.CLERK_JWT_KEY,
          authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(",").map(value => value.trim()).filter(Boolean),
        })
        if (token.sid && token.sub) clerkUserId = token.sub
      } catch { /* Un bearer inválido no puede recurrir a otra identidad de la cookie. */ }
    } else {
      clerkUserId = (await auth()).userId
    }
    const session = await getSubUserSession(request.headers.get("x-subuser-token"))
    if (!clerkUserId || !session) {
      return NextResponse.json({ code: "AUTH_REQUIRED", error: "Inicia sesión con Clerk y selecciona tu usuario." }, { status: 401 })
    }

    let body: unknown
    try { body = await request.json() } catch {
      return NextResponse.json({ code: "INVALID_CONFIRMATION", error: "Envía el PIN y escribe ELIMINAR." }, { status: 400 })
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ code: "INVALID_CONFIRMATION", error: "Confirmación inválida." }, { status: 400 })
    }
    const values = body as Record<string, unknown>
    if (Object.keys(values).some(key => key !== "pin" && key !== "confirmation") ||
      values.confirmation !== "ELIMINAR" || typeof values.pin !== "string" || !values.pin.length || values.pin.length > 128) {
      return NextResponse.json({ code: "INVALID_CONFIRMATION", error: "Introduce tu PIN y escribe ELIMINAR exactamente." }, { status: 400 })
    }
    const result = await requestAccountDeletion({ clerkUserId, accountId: session.accountId, userId: session.userId, pin: values.pin })
    if (!result.success) {
      return NextResponse.json({ code: result.code, error: result.error }, {
        status: result.status, headers: result.retryAfter ? { "Retry-After": String(result.retryAfter) } : undefined,
      })
    }

    let completed = result.job.stage === "COMPLETED"
    if (!completed) {
      try { completed = await processAccountDeletion(result.job.id) } catch {
        // La aceptación ya se confirmó en BD. Un fallo del primer intento no puede ocultarla al cliente.
        console.error("[AccountDeletion] Solicitud aceptada; pendiente de cron", { id: result.job.id })
      }
    }
    const response = NextResponse.json({ success: true, status: completed ? "completed" : "processing" }, {
      status: completed ? 200 : 202, headers: { "Cache-Control": "no-store" },
    })
    response.cookies.delete("movopos-session")
    response.cookies.delete("movopos-cash-device")
    return response
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ code: "TOO_MANY_ATTEMPTS", error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } })
    }
    console.error("[AccountDeletion] No se pudo registrar la solicitud")
    return NextResponse.json({ code: "DELETION_UNAVAILABLE", error: "No se pudo registrar la eliminación. Intenta nuevamente." }, { status: 503 })
  }
}
