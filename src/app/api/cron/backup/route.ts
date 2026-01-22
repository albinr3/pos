import { NextResponse } from "next/server"
import { createBackup } from "@/app/(app)/backups/actions"

// Esta ruta puede ser llamada por un cron job externo o por un servicio de scheduling
// Para usar con Vercel Cron: https://vercel.com/docs/cron-jobs
// Para usar con node-cron localmente, crear un script separado

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  if (process.env.BACKUPS_READONLY === "true" || process.env.VERCEL === "1") {
    return NextResponse.json({ error: "Backups en modo solo lectura en este entorno" }, { status: 400 })
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
