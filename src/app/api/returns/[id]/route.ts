import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { getReturnById } from "@/app/(app)/returns/actions"
import { cashRequest } from "@/lib/cash-context"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromRequest(request)
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!user.isOwner && !user.canAccessReturns) return NextResponse.json({ error: "Sin acceso al módulo" }, { status: 403 })
  const { id } = await context.params
  const record = await cashRequest.run({ trustedActor: user }, () => getReturnById(id))
  if (!record) return NextResponse.json({ error: "Devolución no encontrada" }, { status: 404 })
  const canViewFiscal = user.isOwner || user.canViewFiscalDocuments || user.canPrepareFiscalDocuments
  const fiscal = canViewFiscal && record.fiscalAdjustmentId ? await prisma.fiscalAdjustment.findFirst({
    where: { accountId: user.accountId, id: record.fiscalAdjustmentId, type: "E34" },
    select: { id: true, state: true, fiscalDocumentId: true, originalDocumentId: true, applications: { select: { kind: true, amountCents: true, method: true, treasuryAccountId: true } } },
  }) : null
  // Ocultar también el identificador interno si el usuario no puede consultar la información fiscal.
  return NextResponse.json({ ...record, fiscalAdjustmentId: canViewFiscal ? record.fiscalAdjustmentId : null, fiscal }, { headers: { "Cache-Control": "private, no-store" } })
}
