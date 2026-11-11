import type { PaymentMethod } from "@prisma/client"
import { getRawPrismaClient } from "@/lib/db"

const labels: Record<string, string> = { sale: "SALE_CASH", payment: "AR_PAYMENT", purchase: "PURCHASE", supplierPayment: "SUPPLIER_PAYMENT", operatingExpense: "OPERATING_EXPENSE", employeeExpenseSettlement: "EMPLOYEE_REIMBURSEMENT", return: "CASH_RETURN", fiscalAdjustmentApplication: "FISCAL_REFUND", treasuryTransfer: "TREASURY_TRANSFER", treasuryOpeningBalance: "OPENING_BALANCE" }
export async function cashLedgerDashboard<T extends { movements: Array<{ occurredAt: Date; amountCents: number; direction: "IN" | "OUT" }> }>(accountId: string, from: Date, to: Date, legacy: T, canReverse: boolean): Promise<T> {
  const db = getRawPrismaClient()
  const config = await db.cashControl.findUnique({ where: { accountId } })
  if (!config || to < config.ledgerStartedAt) return legacy
  const [accounts, entries] = await Promise.all([
    db.treasuryAccount.findMany({ where: { accountId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    db.cashMovement.findMany({ where: { accountId, recordedAt: { lte: to } }, include: { treasuryAccount: true }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }] }),
  ])
  const transfers = await db.treasuryTransfer.findMany({ where: { accountId, id: { in: entries.filter(e => e.sourceType === "treasuryTransfer").map(e => e.sourceId) } }, include: { reversedByTransfer: true } })
  const transferById = new Map(transfers.map(t => [t.id, t]))
  const rows = accounts.map(account => {
    const matching = entries.filter(e => e.treasuryAccountId === account.id)
    const inCents = matching.reduce((sum, e) => sum + Math.max(0, e.amountCents), 0)
    const outCents = matching.reduce((sum, e) => sum + Math.max(0, -e.amountCents), 0)
    return { ...account, inCents, outCents, balanceCents: inCents - outCents }
  })
  const movements = entries.filter(e => e.recordedAt >= from).map(e => {
    const transfer = transferById.get(e.sourceId)
    return {
      id: e.id, source: labels[e.sourceType] ?? e.sourceType, direction: e.amountCents >= 0 ? "IN" as const : "OUT" as const,
      amountCents: Math.abs(e.amountCents), occurredAt: e.recordedAt, method: e.method as PaymentMethod | null,
      treasuryAccountId: e.treasuryAccountId, treasuryAccountName: e.treasuryAccount.name,
      reference: e.reference, note: e.note,
      ...(transfer ? { transferId: transfer.id, transferStatus: transfer.status, transferTrace: transfer.reversesTransferId ? "Reverso" : null,
        canReverseTransfer: Boolean(canReverse && e.amountCents < 0 && transfer.status === "ACTIVE" && !transfer.reversesTransferId && !transfer.reversedByTransfer) } : {}),
    }
  })
  // Una factura nueva puede tener fecha anterior al corte. Mezclarla por soldAt con el asiento
  // de hoy duplicaría el flujo. El registro nuevo empieza con sus saldos iniciales explícitos;
  // los períodos completos anteriores al corte siguen utilizando la vista histórica legacy.
  const flows = movements.filter(m => m.source !== "BASELINE")
  return { from, to, ledgerStartedAt: config.ledgerStartedAt, accounts: rows, movements, totals: { inCents: flows.reduce((s, e) => s + (e.direction === "IN" ? e.amountCents : 0), 0), outCents: flows.reduce((s, e) => s + (e.direction === "OUT" ? e.amountCents : 0), 0), balanceCents: rows.reduce((s, a) => s + a.balanceCents, 0) } } as unknown as T
}
