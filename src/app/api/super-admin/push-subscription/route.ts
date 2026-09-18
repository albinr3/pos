import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentSuperAdmin, logSuperAdminAction } from "@/lib/super-admin-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type BrowserPushSubscription = {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
}

async function getPushAdmin() {
  const admin = await getCurrentSuperAdmin()
  return admin && (admin.role === "OWNER" || admin.role === "ADMIN") ? admin : null
}

export async function GET() {
  try {
    const admin = await getPushAdmin()
    if (!admin) return NextResponse.json({ success: false, error: "Solo OWNER o ADMIN pueden administrar alertas push." }, { status: 403 })

    const subscription = await prisma.superAdminWebPushSubscription.findFirst({
      where: { superAdminId: admin.id, enabled: true },
      select: { id: true, updatedAt: true },
    })
    return NextResponse.json({ success: true, enabled: Boolean(subscription), updatedAt: subscription?.updatedAt ?? null })
  } catch (error) {
    console.error("Error consultando suscripción Web Push:", error)
    return NextResponse.json({ success: false, error: "No se pudo consultar la alerta push." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getPushAdmin()
    if (!admin) return NextResponse.json({ success: false, error: "Solo OWNER o ADMIN pueden activar alertas push." }, { status: 403 })

    const body = await request.json() as BrowserPushSubscription
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : ""
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : ""
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : ""

    try {
      const endpointUrl = new URL(endpoint)
      if (endpointUrl.protocol !== "https:") throw new Error("invalid protocol")
    } catch {
      return NextResponse.json({ success: false, error: "La suscripción push no es válida." }, { status: 400 })
    }

    if (!p256dh || !auth) {
      return NextResponse.json({ success: false, error: "Faltan las claves de la suscripción push." }, { status: 400 })
    }

    // La activación de un teléfono reemplaza el receptor anterior en todo el panel.
    await prisma.$transaction(async (tx) => {
      await tx.superAdminWebPushSubscription.updateMany({
        where: { enabled: true },
        data: { enabled: false },
      })
      await tx.superAdminWebPushSubscription.upsert({
        where: { endpoint },
        create: {
          superAdminId: admin.id,
          endpoint,
          p256dh,
          auth,
          userAgent: request.headers.get("user-agent"),
          enabled: true,
          lastSeenAt: new Date(),
        },
        update: {
          superAdminId: admin.id,
          p256dh,
          auth,
          userAgent: request.headers.get("user-agent"),
          enabled: true,
          lastSeenAt: new Date(),
        },
      })
    })

    await logSuperAdminAction(admin.id, "enable_web_push", { metadata: { endpointHost: new URL(endpoint).host } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error guardando suscripción Web Push:", error)
    return NextResponse.json({ success: false, error: "No se pudo activar la alerta push." }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const admin = await getPushAdmin()
    if (!admin) return NextResponse.json({ success: false, error: "Solo OWNER o ADMIN pueden desactivar alertas push." }, { status: 403 })

    await prisma.superAdminWebPushSubscription.updateMany({
      where: { superAdminId: admin.id, enabled: true },
      data: { enabled: false },
    })
    await logSuperAdminAction(admin.id, "disable_web_push")
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error revocando suscripción Web Push:", error)
    return NextResponse.json({ success: false, error: "No se pudo desactivar la alerta push." }, { status: 500 })
  }
}
