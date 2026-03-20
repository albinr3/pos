import { NextResponse } from "next/server"
import { getCurrentSuperAdmin } from "@/lib/super-admin-auth"
import { markAllSuperAdminNotificationsAsRead } from "@/lib/super-admin-notifications"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
    }

    await markAllSuperAdminNotificationsAsRead(admin.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error en POST /api/super-admin/notifications/read-all:", error)
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
