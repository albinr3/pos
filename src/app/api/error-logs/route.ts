import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { logError, getRequestInfo } from "@/lib/error-logger"
import type { ErrorSeverity } from "@prisma/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ALLOWED_SEVERITIES: ErrorSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    let body: any = null
    try {
      body = await request.json()
    } catch {
      body = null
    }

    const message = typeof body?.message === "string" ? body.message.trim() : ""
    if (!message) {
      return NextResponse.json({ error: "message es requerido" }, { status: 400 })
    }

    const stack = typeof body?.stack === "string" ? body.stack : undefined
    const code = typeof body?.code === "string" ? body.code : undefined
    const severityRaw = typeof body?.severity === "string" ? body.severity.toUpperCase() : undefined
    const severity =
      severityRaw && ALLOWED_SEVERITIES.includes(severityRaw as ErrorSeverity)
        ? (severityRaw as ErrorSeverity)
        : undefined
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined
    const requestBody = body?.requestBody ?? body

    const error = new Error(message)
    if (stack) error.stack = stack

    const id = await logError(error, {
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email || undefined,
      code,
      severity,
      metadata,
      requestBody,
      ...getRequestInfo(request),
    })

    return NextResponse.json({ id }, { status: 200 })
  } catch (error) {
    console.error("Error en POST /api/error-logs:", error)
    return NextResponse.json({ error: "Error al registrar log" }, { status: 500 })
  }
}
