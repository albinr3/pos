import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { pageInput, payableWhere, supplierPaymentsWhere, type PayableFilters, type SupplierPaymentFilters } from "@/lib/accounts-payable"
import { purchaseWhere, type PurchaseFilters } from "@/lib/purchase-queries"
import { businessDate, overdueDays, purchasePermit, PurchaseError, type PurchaseActor } from "@/lib/purchase-credit"

export type PurchaseReportKind = "purchases" | "accounts-payable" | "supplier-payments"
export type ReportColumn = { key: string; label: string; type?: "money" | "date" }
export type ReportRow = Record<string, string | number | boolean | null>
export type PurchaseReport = { title: string; columns: ReportColumn[]; data: ReportRow[]; nextSkip: number | null; summary: Record<string, number>; providers: Array<{ supplierId: string; name: string; totalCents: number; balanceCents: number }>; generatedAt: string; balanceBasis: "CURRENT"; filters: Record<string, unknown> }
export type ReportFilters = PurchaseFilters & PayableFilters & SupplierPaymentFilters
const moneyColumn = (key: string, label: string): ReportColumn => ({ key, label, type: "money" })
export async function purchaseReport(actor: PurchaseActor, kind: PurchaseReportKind, filters: ReportFilters = {}, all = false): Promise<PurchaseReport> {
  purchasePermit(actor, "canAccessReports")
  purchasePermit(actor, "canAccessAccountsPayable")
  const { skip, take } = pageInput(filters)
  return prisma.$transaction(async tx => {
    let title: string, columns: ReportColumn[], rows: ReportRow[]
    // Paginar en PostgreSQL; cargar todo para después usar slice agota memoria en cuentas grandes.
    const pagination: { skip?: number; take?: number } = all ? {} : { skip, take: take + 1 }
    let providers: PurchaseReport["providers"] = []
    const summary: Record<string, number> = { count: 0, activeCount: 0, cancelledCount: 0 }
    if (kind === "purchases") {
      title = "Compras"
      const where = purchaseWhere(actor.accountId, filters)
      const activeWhere = { AND: [where, { cancelledAt: null }] } satisfies Prisma.PurchaseWhereInput
      const [purchases, active, cancelled, conditions, debt] = await Promise.all([
        tx.purchase.findMany({ where, include: { payable: true }, orderBy: [{ purchasedAt: "desc" }, { id: "desc" }], ...pagination }),
        tx.purchase.aggregate({ where: activeWhere, _count: true, _sum: { totalCents: true } }),
        tx.purchase.aggregate({ where: { AND: [where, { cancelledAt: { not: null } }] }, _count: true, _sum: { totalCents: true } }),
        tx.purchase.groupBy({ by: ["type"], where: activeWhere, _sum: { totalCents: true } }),
        tx.accountPayable.aggregate({ where: { accountId: actor.accountId, purchase: activeWhere }, _sum: { balanceCents: true } }),
      ])
      columns = [{ key: "date", label: "Fecha de compra" }, { key: "supplier", label: "Proveedor" }, { key: "reference", label: "Compra" }, { key: "type", label: "Condición" }, moneyColumn("totalCents", "Total comprado"), moneyColumn("paidCents", "Abonado actual"), moneyColumn("balanceCents", "Pendiente actual"), { key: "dueDate", label: "Vencimiento" }, { key: "status", label: "Estado" }]
      const totalCents = active._sum.totalCents ?? 0, balanceCents = debt._sum.balanceCents ?? 0
      Object.assign(summary, { count: active._count + cancelled._count, activeCount: active._count, cancelledCount: cancelled._count, totalCents, cashCents: conditions.find(c => c.type === "CONTADO")?._sum.totalCents ?? 0, creditCents: conditions.find(c => c.type === "CREDITO")?._sum.totalCents ?? 0, paidCents: totalCents - balanceCents, balanceCents, cancelledCents: cancelled._sum.totalCents ?? 0 })
      rows = purchases.map(p => {
        const cancelled = !!p.cancelledAt, balanceCents = cancelled ? 0 : p.payable?.balanceCents ?? 0, paidCents = cancelled ? 0 : p.totalCents - balanceCents
        return { id: p.id, date: businessDate(p.purchasedAt), supplier: p.supplierName ?? "Sin proveedor", reference: p.id, type: p.type, totalCents: p.totalCents, paidCents, balanceCents, dueDate: p.payable?.dueDate.toISOString().slice(0, 10) ?? null, status: cancelled ? "ANULADA" : p.payable?.status ?? "PAGADA" }
      })
    } else if (kind === "accounts-payable") {
      title = "Cuentas por pagar actuales"
      const where = payableWhere(actor.accountId, filters)
      const [aps, totals, overdue, groups] = await Promise.all([
        tx.accountPayable.findMany({ where, include: { purchase: true, supplier: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], ...pagination }),
        tx.accountPayable.aggregate({ where, _count: true, _sum: { totalCents: true, balanceCents: true } }),
        tx.accountPayable.aggregate({ where: { AND: [where, { balanceCents: { gt: 0 }, dueDate: { lt: new Date(`${businessDate()}T00:00:00Z`) } }] }, _sum: { balanceCents: true } }),
        tx.accountPayable.groupBy({ by: ["supplierId"], where, _sum: { totalCents: true, balanceCents: true } }),
      ])
      const names = await tx.supplier.findMany({ where: { accountId: actor.accountId, id: { in: groups.map(g => g.supplierId) } }, select: { id: true, name: true } })
      const nameById = new Map(names.map(s => [s.id, s.name]))
      providers = groups.map(g => ({ supplierId: g.supplierId, name: nameById.get(g.supplierId) ?? "Proveedor", totalCents: g._sum.totalCents ?? 0, balanceCents: g._sum.balanceCents ?? 0 }))
      columns = [{ key: "supplier", label: "Proveedor" }, { key: "reference", label: "Compra" }, { key: "dueDate", label: "Vencimiento" }, moneyColumn("totalCents", "Total original"), moneyColumn("paidCents", "Abonado actual"), moneyColumn("balanceCents", "Pendiente actual"), { key: "overdueDays", label: "Días de atraso" }, { key: "status", label: "Estado" }]
      Object.assign(summary, { count: totals._count, activeCount: totals._count, totalCents: totals._sum.totalCents ?? 0, paidCents: (totals._sum.totalCents ?? 0) - (totals._sum.balanceCents ?? 0), balanceCents: totals._sum.balanceCents ?? 0, overdueCents: overdue._sum.balanceCents ?? 0 })
      rows = aps.map(ap => {
        const days = overdueDays(ap.dueDate, ap.balanceCents)
        return { id: ap.id, supplier: ap.purchase.supplierName ?? ap.supplier.name, supplierId: ap.supplierId, reference: ap.purchaseId, dueDate: ap.dueDate.toISOString().slice(0, 10), totalCents: ap.totalCents, paidCents: ap.totalCents - ap.balanceCents, balanceCents: ap.balanceCents, overdueDays: days, status: ap.status }
      })
    } else if (kind === "supplier-payments") {
      title = "Pagos a proveedores"
      const where = supplierPaymentsWhere(actor.accountId, filters)
      const [payments, active, cancelled] = await Promise.all([
        tx.supplierPayment.findMany({ where, include: { ap: { include: { purchase: true } }, user: { select: { name: true } }, treasuryAccount: { select: { name: true } } }, orderBy: [{ paidAt: "desc" }, { id: "desc" }], ...pagination }),
        tx.supplierPayment.aggregate({ where: { AND: [where, { cancelledAt: null }] }, _count: true, _sum: { amountCents: true } }),
        tx.supplierPayment.aggregate({ where: { AND: [where, { cancelledAt: { not: null } }] }, _count: true, _sum: { amountCents: true } }),
      ])
      columns = [{ key: "date", label: "Fecha del pago" }, { key: "supplier", label: "Proveedor" }, { key: "reference", label: "Referencia" }, { key: "purchaseId", label: "Compra" }, moneyColumn("amountCents", "Importe"), { key: "method", label: "Método" }, { key: "account", label: "Cuenta" }, { key: "user", label: "Responsable" }, { key: "status", label: "Estado" }, { key: "cancelledAt", label: "Fecha de anulación" }, { key: "reason", label: "Motivo" }]
      Object.assign(summary, { count: active._count + cancelled._count, activeCount: active._count, cancelledCount: cancelled._count, amountCents: active._sum.amountCents ?? 0, cancelledCents: cancelled._sum.amountCents ?? 0 })
      rows = payments.map(p => {
        return { id: p.id, date: businessDate(p.paidAt), supplier: p.supplierName, reference: p.reference, purchaseId: p.ap.purchaseId, amountCents: p.amountCents, method: p.method, account: p.treasuryAccount.name, user: p.user.name, status: p.cancelledAt ? "ANULADO" : "ACTIVO", cancelledAt: p.cancelledAt?.toISOString() ?? null, reason: p.cancellationReason }
      })
    } else throw new PurchaseError("NOT_FOUND", "Reporte no encontrado", 404)
    const supplier = filters.supplierId ? await tx.supplier.findFirst({ where: { id: filters.supplierId, accountId: actor.accountId }, select: { name: true } }) : null
    const account = filters.treasuryAccountId ? await tx.treasuryAccount.findFirst({ where: { id: filters.treasuryAccountId, accountId: actor.accountId }, select: { name: true } }) : null
    // El resumen se calcula sobre todos los resultados, antes de paginar o exportar.
    return { title, columns, data: all ? rows : rows.slice(0, take), nextSkip: !all && rows.length > take ? skip + take : null, summary, providers, generatedAt: new Date().toISOString(), balanceBasis: "CURRENT", filters: { ...filters, supplierName: supplier?.name, treasuryAccountName: account?.name } }
  }, { timeout: 30000, maxWait: 5000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
