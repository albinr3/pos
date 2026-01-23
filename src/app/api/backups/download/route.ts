import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as path from "path"
import { getCurrentUser } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit-log"

const BACKUPS_DIR = path.join(process.cwd(), "backups")

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const filename = searchParams.get("file")

  if (!filename) {
    return NextResponse.json({ error: "Filename requerido" }, { status: 400 })
  }

  // Validar que el filename es seguro (acepta formato con T o con _)
  if (!/^backup_\d{4}-\d{2}-\d{2}[T_]\d{2}-\d{2}-\d{2}\.sql$/.test(filename)) {
    return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 })
  }

  const filepath = path.join(BACKUPS_DIR, filename)

  try {
    const file = await fs.readFile(filepath)
    const user = await getCurrentUser()
    if (user) {
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
    }
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: "Backup no encontrado" }, { status: 404 })
  }
}
