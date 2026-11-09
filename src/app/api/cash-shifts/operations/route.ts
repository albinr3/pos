import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { createSale } from "@/app/(app)/sales/actions"
import { addPayment, addBatchPayment } from "@/app/(app)/ar/actions"
import { cashErrorResponse } from "@/lib/cash-http"
import { cashRequest, cashDeviceHashFromRequest } from "@/lib/cash-context"
import { withCashOperation } from "@/lib/cash-context"
import { runCashTransaction } from "@/lib/cash-financial-db"
import { getRawPrismaClient } from "@/lib/db"
import { addSupplierPayment } from "@/lib/accounts-payable"
import { createPurchase } from "@/app/(app)/purchases/actions"
import { createPurchaseFromOCR } from "@/app/(app)/purchases/ocr-actions"
import { createOperatingExpense } from "@/app/(app)/operating-expenses/actions"
import { createReturn } from "@/app/(app)/returns/actions"
import { createTreasuryTransfer } from "@/app/(app)/treasury/actions"
import { assertNoFiscalInput, UnsupportedFiscalInputError } from "@/lib/fiscal/core/input"

export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 })
    const actor = await getCurrentUserFromRequest(request)
    if (!actor) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const body = await request.json()
    // No omitir datos fiscales situados fuera de payload al desestructurar la solicitud.
    assertNoFiscalInput(body)
    const { kind, payload, cashOperation } = body
    if (!cashOperation || !payload || !["sale", "payment", "batchPayment", "purchase", "ocrPurchase", "supplierPayment", "expense", "return", "transfer", "discard"].includes(kind)) return NextResponse.json({ error: "Operación inválida" }, { status: 400 })
    const allowed: Record<string, boolean> = { sale: actor.canAccessSales, payment: actor.canAccessAccountsReceivable, batchPayment: actor.canAccessAccountsReceivable, supplierPayment: actor.canRegisterSupplierPayments, purchase: actor.canManagePurchases, ocrPurchase: actor.canManagePurchases, expense: actor.canManageExpenses, return: actor.canAccessReturns, transfer: actor.canCreateTreasuryTransfers, discard: true }
    if (!actor.isOwner && !allowed[kind]) return NextResponse.json({ error: "Sin acceso al módulo" }, { status: 403 })
    // La cola no puede transformar una solicitud fiscal en una operación ordinaria.
    assertNoFiscalInput(payload)
    const result = await cashRequest.run({ trustedActor: actor, deviceHash: cashDeviceHashFromRequest(request), fiscalDiscard: kind === "discard" }, async () => {
      if (kind === "discard") {
        if (typeof payload.reason !== "string" || !payload.reason.trim()) throw new Error("Explica por qué anulas el pendiente")
        return withCashOperation(cashOperation, { kind, ...payload }, () => runCashTransaction(getRawPrismaClient(), async tx => {
          await tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.id, action: "SETTINGS_CHANGED", resourceType: "CashPendingDiscard", resourceId: cashOperation.clientOperationId, details: payload } })
          return { discarded: true }
        }))
      }
      if (kind === "sale") return createSale({ ...payload, username: actor.username, user: actor, cashOperation })
      if (kind === "payment") return addPayment({ ...payload, cashOperation }, actor)
      if (kind === "supplierPayment") return addSupplierPayment(actor, { ...payload, cashOperation })
      if (kind === "purchase") return createPurchase({ ...payload, cashOperation })
      if (kind === "ocrPurchase") return createPurchaseFromOCR({ ...payload, cashOperation })
      if (kind === "expense") return createOperatingExpense({ ...payload, cashOperation })
      if (kind === "return") return createReturn({ ...payload, cashOperation }, actor)
      if (kind === "transfer") return createTreasuryTransfer({ ...payload, cashOperation, transferredAt: payload.transferredAt ? new Date(payload.transferredAt) : undefined })
      return addBatchPayment({ ...payload, cashOperation }, actor)
    })
    return NextResponse.json({ result })
  } catch (error) {
    if (error instanceof UnsupportedFiscalInputError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    return cashErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo registrar la operación" }, { status: 400 })
  }
}
