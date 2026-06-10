import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../_helpers/auth"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function isExpoPushToken(value: unknown): value is string {
  if (typeof value !== "string") return false
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(value.trim())
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const expoPushToken = typeof body?.expoPushToken === "string" ? body.expoPushToken.trim() : ""

    if (!isExpoPushToken(expoPushToken)) {
      return NextResponse.json({ error: "Token Expo inválido" }, { status: 400 })
    }

    const token = await prisma.pushDeviceToken.upsert({
      where: { expoPushToken },
      create: {
        accountId: user.accountId,
        userId: user.id,
        expoPushToken,
        platform: normalizeOptionalString(body?.platform, 32),
        deviceName: normalizeOptionalString(body?.deviceName, 120),
        appVersion: normalizeOptionalString(body?.appVersion, 40),
        enabled: true,
        lastSeenAt: new Date(),
      },
      update: {
        accountId: user.accountId,
        userId: user.id,
        platform: normalizeOptionalString(body?.platform, 32),
        deviceName: normalizeOptionalString(body?.deviceName, 120),
        appVersion: normalizeOptionalString(body?.appVersion, 40),
        enabled: true,
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        enabled: true,
        lastSeenAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      token: {
        id: token.id,
        enabled: token.enabled,
        lastSeenAt: token.lastSeenAt.toISOString(),
      },
    })
  } catch (error) {
    console.error("Error en POST /api/push-tokens:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al registrar token push" },
      { status: 500 }
    )
  }
}
