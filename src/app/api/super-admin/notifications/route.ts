import { NextRequest, NextResponse } from "next/server"
import { getCurrentSuperAdmin } from "@/lib/super-admin-auth"
import { getSuperAdminNotifications } from "@/lib/super-admin-notifications"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentSuperAdmin()
    if (!admin) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
    }

    const limitParam = request.nextUrl.searchParams.get("limit")
    const limit = limitParam ? Number(limitParam) : 20
    const data = await getSuperAdminNotifications(admin, Number.isFinite(limit) ? limit : 20)

    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error("Error en GET /api/super-admin/notifications:", error)
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
