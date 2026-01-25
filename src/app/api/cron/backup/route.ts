import { NextResponse } from "next/server"
import { createBackup } from "@/app/(app)/backups/actions"
import { checkRateLimit, getClientIdentifier, RateLimitError } from "@/lib/rate-limit"

// Esta ruta puede ser llamada por un cron job externo o por un servicio de scheduling
// Para usar con Vercel Cron: https://vercel.com/docs/cron-jobs
// Para usar con node-cron localmente, crear un script separado

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  if (process.env.BACKUPS_READONLY === "true" || process.env.VERCEL === "1") {
    return NextResponse.json({ error: "Backups en modo solo lectura en este entorno" }, { status: 400 })
  }

  // 🔐 RATE LIMITING - proteger el endpoint del cron (aunque tenga token)
  const clientIp = getClientIdentifier(request)
  try {
    checkRateLimit(`cron-backup:ip:${clientIp}`, {
      windowMs: 5 * 60 * 1000, // 5 min
      maxRequests: 30,
      blockDurationMs: 10 * 60 * 1000,
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } }
      )
    }
  }

  // Verificar que la solicitud viene de una fuente autorizada
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const { filename } = await createBackup()
    return NextResponse.json({ success: true, filename })
  } catch (error) {
    console.error("Error en backup automático:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    )
  }
}
