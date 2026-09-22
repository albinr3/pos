import jwt from "jsonwebtoken"
import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/db"

export const runtime = "nodejs"

type UnsubscribeToken = {
  accountId?: string
  purpose?: string
}

function verifyToken(token: string | null): string | null {
  if (!token || !process.env.JWT_SECRET) {
    return null
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET) as UnsubscribeToken
    if (payload.purpose !== "engagement-email-unsubscribe" || !payload.accountId) {
      throw new Error("Invalid unsubscribe token")
    }
    return payload.accountId
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (!verifyToken(token)) {
    return new NextResponse("El enlace para dejar de recibir recordatorios no es válido o venció.", { status: 400 })
  }

  // No aplicar la baja con GET: algunos filtros abren los enlaces automáticamente.
  return new NextResponse(
    `<main><h1>¿Dejar de recibir comunicaciones?</h1><p>Dejarás de recibir comunicaciones de seguimiento de MovoPos. Los correos esenciales de tu cuenta continuarán.</p><form method="post"><input type="hidden" name="token" value="${token}" /><button type="submit">Confirmar baja</button></form></main>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const accountId = verifyToken(formData.get("token")?.toString() ?? null)
  if (!accountId) {
    return new NextResponse("El enlace para dejar de recibir recordatorios no es válido o venció.", { status: 400 })
  }

  // Esta baja solo detiene los recordatorios de inactividad; los correos esenciales continúan.
  await prisma.account.update({
    where: { id: accountId },
    data: { engagementEmailsEnabled: false },
  })

  return new NextResponse(
    "<main><h1>Listo</h1><p>No recibirás más comunicaciones de seguimiento de MovoPos.</p></main>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
}
