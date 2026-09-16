import { NextRequest, NextResponse } from "next/server"

import { sendInitialSetupReminderNotifications } from "@/lib/initial-setup-notifications"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Cron horario de activación. Se mantiene separado del cron de facturación:
 * el primer recordatorio debe salir cerca de las 2 horas sin reprocesar billing.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const results = await sendInitialSetupReminderNotifications()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      reminders: results,
    })
  } catch (error) {
    console.error("Error sending initial setup reminders:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
