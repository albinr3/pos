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
import { FiscalDocumentError } from "@/lib/fiscal/core/document"
import { FiscalSequenceError } from "@/lib/fiscal/core/sequences"
import { confirmCreditAdjustment } from "@/lib/fiscal/core/credit-drafts"
import { applyCustomerCredit } from "@/lib/fiscal/core/customer-credit"
import { confirmDebitAdjustment } from "@/lib/fiscal/core/debit-drafts"
import { createFiscalExpense, createExpenseSettlement } from "@/lib/fiscal/core/employee-expenses"
import { addForeignPayment } from "@/lib/fiscal/core/foreign-payments"

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
    if (!cashOperation || !payload || !["sale", "payment", "batchPayment", "purchase", "ocrPurchase", "supplierPayment", "foreignPayment", "expense", "fiscalExpense", "employeeExpenseSettlement", "return", "fiscalCredit", "fiscalFinancialCredit", "fiscalDebit", "applyFiscalCustomerCredit", "transfer", "discard"].includes(kind)) return NextResponse.json({ error: "Operación inválida" }, { status: 400 })
    const allowed: Record<string, boolean> = { sale: actor.canAccessSales, payment: actor.canAccessAccountsReceivable, batchPayment: actor.canAccessAccountsReceivable, supplierPayment: actor.canRegisterSupplierPayments, foreignPayment: actor.canRegisterSupplierPayments, purchase: actor.canManagePurchases, ocrPurchase: actor.canManagePurchases, expense: actor.canManageExpenses, fiscalExpense: actor.canManageExpenses, employeeExpenseSettlement: actor.canManageExpenses, return: actor.canAccessReturns, fiscalCredit: actor.canAccessReturns, fiscalFinancialCredit: actor.canAccessReturns, fiscalDebit: actor.canAccessSales, applyFiscalCustomerCredit: actor.canAccessAccountsReceivable, transfer: actor.canCreateTreasuryTransfers, discard: true }
    if (!actor.isOwner && !allowed[kind]) return NextResponse.json({ error: "Sin acceso al módulo" }, { status: 403 })
    // La cola no puede transformar una solicitud fiscal en una operación ordinaria.
    if (kind === "sale") {
      const commercialPayload = { ...payload }
      delete commercialPayload.fiscal
      assertNoFiscalInput(commercialPayload)
    } else assertNoFiscalInput(payload)
    const result = await cashRequest.run({ trustedActor: actor, deviceHash: cashDeviceHashFromRequest(request), fiscalDiscard: kind === "discard", fiscalPhysicalOnlyQueued: kind === "fiscalCredit", fiscalFinancialOnlyQueued: kind === "fiscalFinancialCredit" }, async () => {
      if (kind === "discard") {
        if (typeof payload.reason !== "string" || !payload.reason.trim()) throw new Error("Explica por qué anulas el pendiente")
        return withCashOperation(cashOperation, { kind, ...payload }, () => runCashTransaction(getRawPrismaClient(), async tx => {
          await tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.id, action: "SETTINGS_CHANGED", resourceType: "CashPendingDiscard", resourceId: cashOperation.clientOperationId, details: payload } })
          return { discarded: true }
        }))
      }
      if (kind === "sale") return createSale({ ...payload, username: actor.username, user: actor, cashOperation })
      if (kind === "payment") return addPayment({ ...payload, cashOperation })
      if (kind === "supplierPayment") return addSupplierPayment(actor, { ...payload, cashOperation })
      if (kind === "foreignPayment") return addForeignPayment(actor, payload.foreignOperationId, { ...payload, cashOperation })
      if (kind === "purchase") return createPurchase({ ...payload, cashOperation })
      if (kind === "ocrPurchase") return createPurchaseFromOCR({ ...payload, cashOperation })
      if (kind === "expense") return createOperatingExpense({ ...payload, cashOperation })
      if (kind === "fiscalExpense") return createFiscalExpense(actor, { ...payload, cashOperation })
      if (kind === "employeeExpenseSettlement") return createExpenseSettlement(actor, payload.expenseId, { ...payload, cashOperation })
      if (kind === "return") return createReturn({ ...payload, cashOperation })
      if (kind === "fiscalCredit" || kind === "fiscalFinancialCredit") return confirmCreditAdjustment(actor, payload.adjustmentId, { expectedRevision: payload.expectedRevision, settlement: payload.settlement, cashOperation })
      if (kind === "applyFiscalCustomerCredit") return applyCustomerCredit(actor, payload.creditId, { receivableId: payload.receivableId, amountCents: payload.amountCents, cashOperation })
      if (kind === "fiscalDebit") return confirmDebitAdjustment(actor, payload.adjustmentId, { expectedRevision: payload.expectedRevision, payment: payload.payment, cashOperation })
      if (kind === "transfer") return createTreasuryTransfer({ ...payload, cashOperation, transferredAt: payload.transferredAt ? new Date(payload.transferredAt) : undefined })
      return addBatchPayment({ ...payload, cashOperation })
    })
    return NextResponse.json({ result })
  } catch (error) {
    if (error instanceof UnsupportedFiscalInputError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    if (error instanceof FiscalDocumentError) return NextResponse.json({ error: error.issues[0]?.message ?? error.message, code: error.code, fields: error.issues }, { status: error.status })
    if (error instanceof FiscalSequenceError) return NextResponse.json({ error: error.message, code: error.code, fields: error.fields.map(field => ({ field, message: error.message })) }, { status: error.status })
    return cashErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo registrar la operación" }, { status: 400 })
  }
}
