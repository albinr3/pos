import { NextRequest, NextResponse } from "next/server"
import { processBillingEngine } from "@/lib/billing"
import { sendBillingNotifications } from "@/lib/billing-notifications"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Cron job diario para procesar billing
 * 
 * Funciones:
 * 1. Verificar trials vencidos -> blocked
 * 2. Verificar períodos vencidos -> grace
 * 3. Verificar grace vencida -> blocked
 * 4. Aplicar cambios pendientes de moneda/método
 * 5. Enviar notificaciones según calendario
 * 
 * Configuración en Vercel (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/billing",
 *     "schedule": "0 8 * * *"
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  // Verificar autorización
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    console.log("Starting billing engine cron job...")

    // 1. Procesar estados de suscripciones
    const engineResults = await processBillingEngine()
    console.log("Billing engine results:", engineResults)

    // 2. Enviar notificaciones
    let notificationResults = { sent: 0, errors: 0 }
    try {
      notificationResults = await sendBillingNotifications()
      console.log("Notification results:", notificationResults)
    } catch (notifError) {
      console.error("Error sending notifications:", notifError)
      notificationResults.errors = 1
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      engine: engineResults,
      notifications: notificationResults,
    })
  } catch (error) {
    console.error("Error in billing cron job:", error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Error desconocido",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
