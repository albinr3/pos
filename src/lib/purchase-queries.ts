import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { hasPermission } from "@/lib/permissions"
import { dateOnly, PurchaseError, purchaseType, type PurchaseActor } from "@/lib/purchase-credit"
import { pageInput } from "@/lib/accounts-payable"

export type PurchaseFilters = { query?: string; supplierId?: string; type?: string; cancelled?: string; from?: string; to?: string; skip?: number; take?: number }
export function purchaseWhere(accountId: string, f: PurchaseFilters): Prisma.PurchaseWhereInput {
  if (f.type) purchaseType(f.type)
  if (f.cancelled && !["all", "true", "false"].includes(f.cancelled)) throw new PurchaseError("INVALID_FILTER", "Filtro de anulación inválido")
  const from = f.from ? dateOnly(f.from) : undefined, to = f.to ? dateOnly(f.to) : undefined
  if (from && to && from > to) throw new PurchaseError("INVALID_DATE_RANGE", "El inicio debe ser anterior al final")
  return { accountId, ...(f.supplierId ? { supplierId: f.supplierId } : {}), ...(f.type ? { type: f.type as "CONTADO" | "CREDITO" } : {}), ...(f.cancelled === "all" ? {} : { cancelledAt: f.cancelled === "true" ? { not: null } : null }),
    ...(from || to ? { purchasedAt: { ...(from ? { gte: new Date(from.getTime() + 4 * 3600000) } : {}), ...(to ? { lt: new Date(to.getTime() + 28 * 3600000) } : {}) } } : {}),
    ...(f.query ? { OR: [{ supplierName: { contains: f.query, mode: "insensitive" } }, { notes: { contains: f.query, mode: "insensitive" } }, { id: { contains: f.query, mode: "insensitive" } }] } : {}) }
}
export function purchaseReadPermit(actor: PurchaseActor) {
  if (!["canManagePurchases", "canCancelPurchases", "canAccessAccountsPayable"].some(p => hasPermission(actor, p as "canManagePurchases"))) throw new PurchaseError("FORBIDDEN", "No tienes permiso para consultar compras", 403)
}
export function purchaseFinancialFields(row: { totalCents: number; supplierNetPaidCents?: number | null; cancelledAt: Date | null; payable?: { id: string; totalCents: number; balanceCents: number; dueDate: Date } | null }) {
  const balanceCents = row.cancelledAt ? 0 : row.payable?.balanceCents ?? 0
  // Las retenciones no son pagos al proveedor y no deben sumarse a los abonos.
  return { dueDate: row.payable?.dueDate.toISOString().slice(0, 10) ?? null, payableId: row.payable?.id ?? null, balanceCents, paidCents: row.cancelledAt ? 0 : (row.payable?.totalCents ?? row.supplierNetPaidCents ?? row.totalCents) - balanceCents }
}
export async function listPurchaseRecords(actor: PurchaseActor, filters: PurchaseFilters = {}) {
  purchaseReadPermit(actor)
  const { skip, take } = pageInput(filters)
  const rows = await prisma.purchase.findMany({ where: purchaseWhere(actor.accountId, { cancelled: "all", ...filters }), include: { payable: true, items: { include: { product: { select: { id: true, name: true, sku: true } } } } }, orderBy: [{ purchasedAt: "desc" }, { id: "desc" }], skip, take: take + 1 })
  return { data: rows.slice(0, take).map(row => ({ ...row, ...purchaseFinancialFields(row), itemsCount: row.items.length, items: row.items.map(i => ({ ...i, productName: i.product.name, qty: Number(i.qty) })) })), nextSkip: rows.length > take ? skip + take : null }
}
