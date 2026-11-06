import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { processAccountDeletion } from "@/lib/account-deletion"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET && `Bearer ${process.env.CRON_SECRET}`
  const received = request.headers.get("authorization") || ""
  // Fallar cerrado: sin CRON_SECRET tampoco se permite ejecutar el borrado.
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(received) || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  try {
    const now = new Date()
    const jobs = await prisma.accountDeletion.findMany({ where: {
      stage: { not: "COMPLETED" }, nextAttemptAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    }, orderBy: { nextAttemptAt: "asc" }, take: 10, select: { id: true } })
    let processed = 0, completed = 0
    for (const job of jobs) {
      if (Date.now() - now.getTime() > 40000) break
      if (await processAccountDeletion(job.id)) completed++
      processed++
    }
    return NextResponse.json({ processed, completed, pending: processed - completed })
  } catch {
    console.error("[AccountDeletion] Falló el procesamiento del cron")
    return NextResponse.json({ error: "No se pudieron procesar las eliminaciones." }, { status: 500 })
  }
}
