import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../../_helpers/auth"
import { prisma } from "@/lib/db"
import { decodeCashResult, type CashJson } from "@/lib/cash-money"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest, context: { params: Promise<{ operationId: string }> }) {
  const user = await getCurrentUserFromRequest(request)
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  if (!user.isOwner && !user.canAccessAccountsReceivable) return NextResponse.json({ error: "Sin acceso a cuentas por cobrar" }, { status: 403 })
  const { operationId } = await context.params
  if (!operationId || operationId.length > 100) return NextResponse.json({ error: "Identificador inválido" }, { status: 400 })
  const notFound = () => NextResponse.json({ error: "Operación no encontrada" }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
  const operation = await prisma.cashOperation.findUnique({ where: { accountId_clientOperationId: { accountId: user.accountId, clientOperationId: operationId } } })
  // Un identificador conocido no autoriza a consultar operaciones de otro empleado.
  if (!operation || operation.userId !== user.id) return notFound()
  const decoded = decodeCashResult(operation.response as CashJson)
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return notFound()
  const result = decoded as Record<string, unknown>
  const paymentIds = typeof result.paymentId === "string" ? [result.paymentId] : Array.isArray(result.paymentIds) && result.paymentIds.every(id => typeof id === "string") ? result.paymentIds as string[] : []
  let permitted = false
  if (paymentIds.length) {
    const unique = [...new Set(paymentIds)]
    permitted = unique.length === paymentIds.length && await prisma.payment.count({ where: { id: { in: unique }, userId: user.id, ar: { accountId: user.accountId } } }) === unique.length
  } else if (typeof result.id === "string" && typeof result.creditId === "string" && typeof result.receivableId === "string") {
    permitted = Boolean(await prisma.fiscalCustomerCreditApplication.findFirst({ where: { id: result.id, accountId: user.accountId, actorUserId: user.id, creditId: result.creditId, receivableId: result.receivableId }, select: { id: true } }))
  } else if (typeof result.receivableId === "string" && typeof result.documentId === "string") {
    permitted = Boolean(await prisma.accountReceivable.findFirst({ where: { id: result.receivableId, accountId: user.accountId, debitAdjustment: { fiscalDocumentId: result.documentId } }, select: { id: true } }))
  }
  if (!permitted) return notFound()
  return NextResponse.json({ operationId, status: "COMPLETED", result }, { headers: { "Cache-Control": "private, no-store" } })
}
