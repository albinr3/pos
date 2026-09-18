import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { checkRateLimit, getClientIdentifier, RateLimitError } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const INSTALLATION_ID_PATTERN = /^movopos_install_[a-z0-9_]+$/i
const MAX_INSTALLATION_ID_LENGTH = 160
const MAX_APP_VERSION_LENGTH = 40

function isValidInstallationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_INSTALLATION_ID_LENGTH &&
    INSTALLATION_ID_PATTERN.test(value)
  )
}

function isMobilePlatform(value: unknown): value is "android" | "ios" {
  return value === "android" || value === "ios"
}

function normalizeAppVersion(value: unknown): string | null {
  if (typeof value !== "string") return null
  const appVersion = value.trim()
  if (!appVersion || appVersion.length > MAX_APP_VERSION_LENGTH) return null
  return appVersion
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const installationId = typeof body?.installationId === "string" ? body.installationId.trim() : ""
    const appVersion = normalizeAppVersion(body?.appVersion)

    if (!isValidInstallationId(installationId) || !isMobilePlatform(body?.platform) || !appVersion) {
      return NextResponse.json({ error: "Datos de instalación inválidos" }, { status: 400 })
    }

    try {
      checkRateLimit(`mobile-installation:ip:${getClientIdentifier(request)}`, {
        windowMs: 60 * 1000,
        maxRequests: 90,
      })
      checkRateLimit(`mobile-installation:id:${installationId}`, {
        windowMs: 60 * 1000,
        maxRequests: 5,
      })
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Demasiados reportes de instalación" },
          { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
        )
      }
      throw error
    }

    const now = new Date()
    await prisma.mobileInstallation.upsert({
      where: { installationId },
      create: {
        installationId,
        platform: body.platform,
        appVersion,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        platform: body.platform,
        appVersion,
        lastSeenAt: now,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error en POST /api/mobile/installations/heartbeat:", error)
    return NextResponse.json({ error: "No se pudo registrar la instalación" }, { status: 500 })
  }
}
