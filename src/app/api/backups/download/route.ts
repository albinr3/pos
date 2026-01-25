import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as path from "path"
import { getCurrentUser } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit-log"
import { checkRateLimit, getClientIdentifier, RateLimitError } from "@/lib/rate-limit"

const BACKUPS_DIR = path.join(process.cwd(), "backups")

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const filename = searchParams.get("file")

  if (!filename) {
    return NextResponse.json({ error: "Filename requerido" }, { status: 400 })
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  if (!user.canManageBackups && user.role !== "ADMIN" && user.username !== "admin") {
    return NextResponse.json({ error: "No tienes permiso para gestionar backups" }, { status: 403 })
  }

  // 🔐 RATE LIMITING - descargar backups puede ser costoso y sensible
  const clientIp = getClientIdentifier(request)
  try {
    checkRateLimit(`backup-download:user:${user.accountId}:${user.id}`, {
      windowMs: 60 * 1000, // 1 min
      maxRequests: 30,
      blockDurationMs: 60 * 1000,
    })
    checkRateLimit(`backup-download:ip:${clientIp}`, {
      windowMs: 60 * 1000, // 1 min
      maxRequests: 60,
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: `Demasiadas descargas. Intenta de nuevo en ${error.retryAfter} segundos.` },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } }
      )
    }
  }

  // Validar que el filename es seguro (acepta formato con T o con _)
  if (!/^backup_\d{4}-\d{2}-\d{2}[T_]\d{2}-\d{2}-\d{2}\.sql$/.test(filename)) {
    return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 })
  }

  const filepath = path.join(BACKUPS_DIR, filename)

  try {
    const file = await fs.readFile(filepath)
    await logAuditEvent({
      accountId: user.accountId,
      userId: user.id,
      userEmail: user.email ?? null,
      userUsername: user.username ?? null,
      action: "BACKUP_DOWNLOADED",
      resourceType: "Backup",
      resourceId: filename,
      details: { filename },
    })
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: "Backup no encontrado" }, { status: 404 })
  }
}
