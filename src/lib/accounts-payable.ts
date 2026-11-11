import { assertNoFiscalInput } from "@/lib/fiscal/core/input"
import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { cashRequest, withCashOperation, type CashOperationInput } from "@/lib/cash-context"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { hasPermission } from "@/lib/permissions"
import { businessDate, dateOnly, lockPurchaseAccount, moneyCents, overdueDays, payableStatus, purchaseOperation, purchasePermit, PurchaseError, supplierPaymentAccount, type PurchaseActor } from "@/lib/purchase-credit"

const apInclude = { purchase: true, supplier: { select: { id: true, name: true, isActive: true, phone: true } } } satisfies Prisma.AccountPayableInclude
const paymentInclude = { ap: { include: apInclude }, user: { select: { id: true, name: true, username: true } }, treasuryAccount: { select: { id: true, name: true } }, cancelledUser: { select: { id: true, name: true } } } satisfies Prisma.SupplierPaymentInclude
type APRow = Prisma.AccountPayableGetPayload<{ include: typeof apInclude }>
export function payableDTO(row: APRow) {
  // Conservar el registro para auditoría no convierte una compra anulada en deuda vigente.
  const cancelled = Boolean(row.purchase?.cancelledAt)
  const balanceCents = cancelled ? 0 : row.balanceCents
  const days = overdueDays(row.dueDate, balanceCents)
  return { ...row, balanceCents, paidCents: cancelled ? 0 : row.totalCents - balanceCents, cancelled, dueDate: row.dueDate.toISOString().slice(0, 10), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), overdueDays: days, overdue: days > 0 }
}
export type PayableFilters = { query?: string; supplierId?: string; status?: string; overdue?: string; skip?: number; take?: number }
export function pageInput(input: { skip?: number; take?: number }) {
  const skip = input.skip ?? 0, take = input.take ?? 50
  if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(take) || take < 1 || take > 500) throw new PurchaseError("INVALID_PAGINATION", "Usa skip >= 0 y take entre 1 y 500")
  return { skip, take }
}
export function payableWhere(accountId: string, filters: PayableFilters): Prisma.AccountPayableWhereInput {
  if (filters.status && !["PENDIENTE", "PARCIAL", "PAGADA"].includes(filters.status)) throw new PurchaseError("INVALID_STATUS", "Estado de deuda inválido")
  if (filters.overdue && !["true", "false"].includes(filters.overdue)) throw new PurchaseError("INVALID_FILTER", "overdue debe ser true o false")
  return { accountId, AND: [{ OR: [{ purchaseId: null }, { purchase: { cancelledAt: null } }] }], ...(filters.supplierId ? { supplierId: filters.supplierId } : {}), ...(filters.status ? { status: filters.status as "PENDIENTE" | "PARCIAL" | "PAGADA" } : {}),
    ...(filters.query ? { OR: [{ supplier: { name: { contains: filters.query, mode: "insensitive" } } }, { purchase: { supplierName: { contains: filters.query, mode: "insensitive" } } }, { purchaseId: { contains: filters.query, mode: "insensitive" } }, { description: { contains: filters.query, mode: "insensitive" } }] } : {}),
    ...(filters.overdue === "true" ? { balanceCents: { gt: 0 }, dueDate: { lt: dateOnly(businessDate()) } } : {}),
    ...(filters.overdue === "false" ? { NOT: { balanceCents: { gt: 0 }, dueDate: { lt: dateOnly(businessDate()) } } } : {}) }
}
export async function createStandalonePayable(actor: PurchaseActor, input: { supplierId: string; description: string; notes?: string | null; supplierReceiptNumber?: string | null; totalCents: number; dueDate: string; operationId: string }) {
  purchasePermit(actor, "canAccessAccountsPayable")
  purchasePermit(actor, "canManagePurchases")
  if (typeof input.supplierId !== "string" || !input.supplierId.trim()) throw new PurchaseError("INVALID_SUPPLIER", "Selecciona un proveedor")
  if (typeof input.description !== "string" || !input.description.trim() || input.description.trim().length > 200) throw new PurchaseError("INVALID_DESCRIPTION", "Indica un concepto de hasta 200 caracteres")
  if (input.notes != null && (typeof input.notes !== "string" || input.notes.length > 1000)) throw new PurchaseError("INVALID_NOTES", "Las notas admiten hasta 1000 caracteres")
  if (input.supplierReceiptNumber != null && (typeof input.supplierReceiptNumber !== "string" || input.supplierReceiptNumber.trim().length > 50)) throw new PurchaseError("INVALID_BODY", "El comprobante admite hasta 50 caracteres")
  const totalCents = moneyCents(input.totalCents), dueDate = dateOnly(input.dueDate)
  return prisma.$transaction(async tx => {
    await lockPurchaseAccount(tx, actor.accountId)
    return purchaseOperation(tx, actor, "standalonePayable", input.operationId, input, async () => {
      const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, accountId: actor.accountId, isActive: true }, select: { id: true } })
      if (!supplier) throw new PurchaseError("INVALID_SUPPLIER", "Selecciona un proveedor activo")
      // Este origen no crea Purchase ni altera existencias; el pago se registra por la vía habitual.
      const row = await tx.accountPayable.create({ data: { accountId: actor.accountId, supplierId: supplier.id, description: input.description.trim(), notes: input.notes?.trim() || null, supplierReceiptNumber: input.supplierReceiptNumber?.trim() || null, totalCents, balanceCents: totalCents, dueDate }, include: apInclude })
      await logAuditEvent({ accountId: actor.accountId, userId: actor.id, action: "PURCHASE_CREATED", resourceType: "AccountPayable", resourceId: row.id, details: { origin: "STANDALONE", totalCents } }, tx)
      return payableDTO(row)
    })
  }, TRANSACTION_OPTIONS)
}
export async function listPayables(actor: PurchaseActor, filters: PayableFilters = {}) {
  purchasePermit(actor, "canAccessAccountsPayable")
  const { skip, take } = pageInput(filters), where = payableWhere(actor.accountId, filters)
  return prisma.$transaction(async tx => {
    const [rows, totals, overdue, providers] = await Promise.all([
      tx.accountPayable.findMany({ where, include: apInclude, orderBy: [{ dueDate: "asc" }, { id: "asc" }], skip, take: take + 1 }),
      tx.accountPayable.aggregate({ where, _sum: { totalCents: true, balanceCents: true }, _count: true }),
      tx.accountPayable.aggregate({ where: { AND: [where, { balanceCents: { gt: 0 }, dueDate: { lt: dateOnly(businessDate()) } }] }, _sum: { balanceCents: true } }),
      tx.accountPayable.groupBy({ by: ["supplierId"], where, _sum: { totalCents: true, balanceCents: true }, _count: true }),
    ])
    const supplierNames = await tx.supplier.findMany({ where: { accountId: actor.accountId, id: { in: providers.map(p => p.supplierId) } }, select: { id: true, name: true } })
    return { data: rows.slice(0, take).map(payableDTO), nextSkip: rows.length > take ? skip + take : null, summary: { count: totals._count, totalCents: totals._sum.totalCents ?? 0, balanceCents: totals._sum.balanceCents ?? 0, overdueCents: overdue._sum.balanceCents ?? 0 }, providers: providers.map(p => ({ supplierId: p.supplierId, name: supplierNames.find(s => s.id === p.supplierId)?.name ?? "Proveedor", totalCents: p._sum.totalCents ?? 0, balanceCents: p._sum.balanceCents ?? 0, count: p._count })), generatedAt: new Date().toISOString(), balanceBasis: "CURRENT" }
  }, { ...TRANSACTION_OPTIONS, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
export async function getPayable(actor: PurchaseActor, id: string) {
  purchasePermit(actor, "canAccessAccountsPayable")
  const row = await prisma.accountPayable.findFirst({ where: { id, accountId: actor.accountId }, include: { ...apInclude, payments: { include: { user: { select: { name: true } }, treasuryAccount: { select: { id: true, name: true } } }, orderBy: [{ paidAt: "desc" }, { id: "desc" }] } } })
  if (!row) throw new PurchaseError("NOT_FOUND", "Cuenta por pagar no encontrada", 404)
  const foreignTables = await prisma.$queryRaw<Array<{present:boolean}>>`SELECT to_regclass('"FiscalForeignOperation"') IS NOT NULL AS present`
  const foreign = foreignTables[0]?.present ? await prisma.fiscalForeignOperation.findFirst({where:{accountId:actor.accountId,payableId:id},select:{id:true}}) : null
  return { ...payableDTO(row), foreignOperationId: foreign?.id ?? null, payments: row.payments }
}
export async function patchStandalonePayable(actor: PurchaseActor, id: string, input: { dueDate?: string; notes?: string | null }) {
  purchasePermit(actor, "canAccessAccountsPayable")
  purchasePermit(actor, "canManagePurchases")
  if (input.notes != null && (typeof input.notes !== "string" || input.notes.length > 1000)) throw new PurchaseError("INVALID_NOTES", "Las notas admiten hasta 1000 caracteres")
  const dueDate = input.dueDate === undefined ? undefined : dateOnly(input.dueDate)
  return prisma.$transaction(async tx => {
    await lockPurchaseAccount(tx, actor.accountId)
    const row = await tx.accountPayable.findFirst({ where: { id, accountId: actor.accountId, purchaseId: null } })
    if (!row) throw new PurchaseError("NOT_FOUND", "Obligación no encontrada", 404)
    // El vencimiento forma parte de la copia fiscal preparada y no puede alterarse después.
    if (dueDate && await tx.fiscalDocument.count({ where: { accountId: actor.accountId, payableId: id, state: "PREPARADO_PENDIENTE_CONEXION" } })) throw new PurchaseError("FISCAL_DOCUMENT_EXISTS", "El vencimiento está congelado en el documento fiscal", 409)
    const updated = await tx.accountPayable.update({ where: { id }, data: { ...(dueDate ? { dueDate } : {}), ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}) }, include: apInclude })
    return payableDTO(updated)
  }, TRANSACTION_OPTIONS)
}
export type SupplierPaymentInput = { apId: string; amountCents: number; method: string; treasuryAccountId: string; note?: string | null; operationId: string; cashOperation?: CashOperationInput }
export async function createSupplierPaymentInTransaction(tx: Prisma.TransactionClient, actor: PurchaseActor, input: Omit<SupplierPaymentInput, "operationId">) {
  purchasePermit(actor, "canRegisterSupplierPayments")
  // Prisma omite undefined: sin esta validación un apId ausente podría seleccionar otra deuda.
  if (typeof input.apId !== "string" || !input.apId.trim()) throw new PurchaseError("INVALID_PAYABLE_ID", "Selecciona la cuenta por pagar")
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") throw new PurchaseError("INVALID_BODY", "La nota debe ser texto")
  const amountCents = moneyCents(input.amountCents)
  const ap = await tx.accountPayable.findFirst({ where: { id: input.apId, accountId: actor.accountId }, include: { purchase: true, supplier: { select: { name: true } } } })
  if (!ap || ap.purchase?.cancelledAt) throw new PurchaseError("NOT_FOUND", "Cuenta por pagar no encontrada o anulada", 404)
  // Un pago exterior necesita asignar base e ISR; la ruta ordinaria no puede omitirlos.
  // Durante el despliegue y las pruebas de la etapa 11 puede seguir existiendo una base sin la migración exterior.
  const foreignTables = await tx.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('"FiscalForeignOperation"') IS NOT NULL AS present`
  if (foreignTables[0]?.present && await tx.fiscalForeignOperation.findFirst({ where: { accountId: actor.accountId, payableId: ap.id }, select: { id: true } }) && cashRequest.getStore()?.fiscalForeignPaymentAuthorizedAccountId !== actor.accountId) throw new PurchaseError("FOREIGN_PAYMENT_REQUIRED", "Registra el abono desde Pago al exterior", 409)
  if (amountCents > ap.balanceCents) throw new PurchaseError("PAYMENT_EXCEEDS_BALANCE", "El pago supera el saldo pendiente", 409)
  const { account, method } = await supplierPaymentAccount(tx, actor, input.method, input.treasuryAccountId)
  const reference = `PP-${randomUUID()}`
  const paymentScope = cashRequest.getStore()
  if (paymentScope) paymentScope.fiscalSupplierPaymentAuthorizedAccountId = actor.accountId
  const payment = await tx.supplierPayment.create({ data: { accountId: actor.accountId, apId: ap.id, supplierId: ap.supplierId, supplierName: ap.purchase?.supplierName ?? ap.supplier.name, userId: actor.id, amountCents, method, treasuryAccountId: account.id, reference, note: input.note?.trim() || null } })
  const balanceCents = ap.balanceCents - amountCents
  await tx.accountPayable.update({ where: { id: ap.id }, data: { balanceCents, status: payableStatus(ap.totalCents, balanceCents) } })
  await logAuditEvent({ accountId: actor.accountId, userId: actor.id, action: "SUPPLIER_PAYMENT_CREATED", resourceType: "SupplierPayment", resourceId: payment.id, details: { apId: ap.id, amountCents, reference, treasuryAccountId: account.id } }, tx)
  return { ...payment, paidAt: payment.paidAt.toISOString(), createdAt: payment.createdAt.toISOString(), newBalanceCents: balanceCents }
}
export async function addSupplierPayment(actor: PurchaseActor, input: SupplierPaymentInput) {
  // No confirmar efectos ordinarios cuando el cliente solicita una operación fiscal no admitida.
  assertNoFiscalInput(input)
  purchasePermit(actor, "canRegisterSupplierPayments")
  return cashRequest.run({ ...cashRequest.getStore(), fiscalSupplierPaymentRequested: true }, () => withCashOperation(input.cashOperation, { kind: "supplierPayment", ...input }, () => prisma.$transaction(async tx => {
    await lockPurchaseAccount(tx, actor.accountId)
    return purchaseOperation(tx, actor, "supplierPayment", input.operationId, input, () => createSupplierPaymentInTransaction(tx, actor, input))
  }, TRANSACTION_OPTIONS)))
}
export async function cancelSupplierPayment(actor: PurchaseActor, id: string, reason: string) {
  purchasePermit(actor, "canCancelSupplierPayments")
  if (typeof reason !== "string" || !reason.trim()) throw new PurchaseError("REASON_REQUIRED", "Escribe el motivo de anulación")
  return prisma.$transaction(async tx => {
    await lockPurchaseAccount(tx, actor.accountId)
    const payment = await tx.supplierPayment.findFirst({ where: { id, accountId: actor.accountId }, include: { ap: true } })
    if (!payment) throw new PurchaseError("NOT_FOUND", "Pago no encontrado", 404)
    if (payment.cancelledAt) return { id, cancelledAt: payment.cancelledAt.toISOString() }
    const foreignTables = await tx.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('"FiscalForeignPayment"') IS NOT NULL AS present`
    const foreign = foreignTables[0]?.present ? await tx.fiscalForeignPayment.findFirst({ where: { accountId: actor.accountId, supplierPaymentId: id }, include: { foreignOperation: { include: { payments: { include: { supplierPayment: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] } } } } }) : null
    if (foreign) {
      // Revertir en orden inverso conserva el reparto acumulado de ISR por concepto.
      const latest = foreign.foreignOperation.payments.find(row => !row.supplierPayment.cancelledAt)
      if (latest?.id !== foreign.id) throw new PurchaseError("FOREIGN_PAYMENT_ORDER", "Anula primero los abonos exteriores posteriores", 409)
      const documents = await tx.fiscalDocument.findMany({ where: { accountId: actor.accountId, supplierPaymentId: id, state: { not: "DESCARTADO" } }, select: { id: true, state: true, revision: true } })
      if (documents.some(doc => doc.state === "PREPARADO_PENDIENTE_CONEXION")) throw new PurchaseError("FISCAL_DOCUMENT_EXISTS", "El pago tiene un E47 preparado y no se puede anular", 409)
      for (const doc of documents) {
        // Una revisión de pago anulado nunca puede reservar un número más tarde.
        await tx.$executeRaw`UPDATE "FiscalDocument" SET state='DESCARTADO',"updatedAt"=now() WHERE id=${doc.id} AND "accountId"=${actor.accountId}`
        await tx.$executeRaw`INSERT INTO "FiscalDocumentEvent" (id,"accountId","documentId","actorUserId",state,details) VALUES (${randomUUID()},${actor.accountId},${doc.id},${actor.id},'DESCARTADO',${JSON.stringify({action:"PAYMENT_CANCELLED",reason:reason.trim(),revision:doc.revision})}::jsonb)`
      }
    }
    const paymentScope = cashRequest.getStore()
    if (paymentScope) paymentScope.fiscalSupplierPaymentAuthorizedAccountId = actor.accountId
    await tx.supplierPayment.update({ where: { id }, data: { cancelledAt: new Date(), cancelledBy: actor.id, cancellationReason: reason.trim() } })
    const foreignSnapshot = foreign?.snapshot as { withheldDopCents?: number } | undefined
    const totalCents = payment.ap.totalCents - (foreign?.roundingCents ?? 0)
    const balanceCents = payment.ap.balanceCents + payment.amountCents - (foreign?.roundingCents ?? 0)
    await tx.accountPayable.update({ where: { id: payment.apId }, data: { totalCents, balanceCents, status: payableStatus(totalCents, balanceCents), ...(foreign ? { withheldIsrCents: { decrement: foreignSnapshot?.withheldDopCents ?? 0 } } : {}) } })
    await logAuditEvent({ accountId: actor.accountId, userId: actor.id, action: "SUPPLIER_PAYMENT_CANCELLED", resourceType: "SupplierPayment", resourceId: id, details: { reason, amountCents: payment.amountCents, apId: payment.apId } }, tx)
    return { id, newBalanceCents: balanceCents }
  }, TRANSACTION_OPTIONS)
}
export type SupplierPaymentFilters = { query?: string; supplierId?: string; method?: string; treasuryAccountId?: string; cancelled?: string; from?: string; to?: string; skip?: number; take?: number }
export function supplierPaymentsWhere(accountId: string, f: SupplierPaymentFilters): Prisma.SupplierPaymentWhereInput {
  if (f.method && !["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"].includes(f.method)) throw new PurchaseError("INVALID_PAYMENT_METHOD", "Método inválido")
  if (f.cancelled && !["all", "true", "false"].includes(f.cancelled)) throw new PurchaseError("INVALID_FILTER", "Filtro de anulación inválido")
  const from = f.from ? dateOnly(f.from) : undefined, to = f.to ? dateOnly(f.to) : undefined
  if (from && to && from > to) throw new PurchaseError("INVALID_DATE_RANGE", "El inicio debe ser anterior al final")
  return { accountId, ...(f.supplierId ? { supplierId: f.supplierId } : {}), ...(f.method ? { method: f.method as "EFECTIVO" } : {}), ...(f.treasuryAccountId ? { treasuryAccountId: f.treasuryAccountId } : {}), ...(f.cancelled === "all" ? {} : { cancelledAt: f.cancelled === "true" ? { not: null } : null }),
    ...(from || to ? { paidAt: { ...(from ? { gte: new Date(from.getTime() + 4 * 3600000) } : {}), ...(to ? { lt: new Date(to.getTime() + 28 * 3600000) } : {}) } } : {}),
    ...(f.query ? { OR: [{ reference: { contains: f.query, mode: "insensitive" } }, { supplierName: { contains: f.query, mode: "insensitive" } }, { supplier: { name: { contains: f.query, mode: "insensitive" } } }] } : {}) }
}
export async function listSupplierPayments(actor: PurchaseActor, f: SupplierPaymentFilters = {}) {
  purchasePermit(actor, "canAccessAccountsPayable")
  const { skip, take } = pageInput(f), where = supplierPaymentsWhere(actor.accountId, f)
  const rows = await prisma.supplierPayment.findMany({ where, include: paymentInclude, orderBy: [{ paidAt: "desc" }, { id: "desc" }], skip, take: take + 1 })
  return { data: rows.slice(0, take).map(row => ({ ...row, ap: payableDTO(row.ap) })), nextSkip: rows.length > take ? skip + take : null }
}
export async function getSupplierPayment(actor: PurchaseActor, id: string) {
  purchasePermit(actor, "canAccessAccountsPayable")
  const row = await prisma.supplierPayment.findFirst({ where: { id, accountId: actor.accountId }, include: paymentInclude })
  if (!row) throw new PurchaseError("NOT_FOUND", "Pago no encontrado", 404)
  return { ...row, ap: payableDTO(row.ap) }
}
export async function supplierPaymentOptions(actor: PurchaseActor) {
  if (!["canManagePurchases", "canRegisterSupplierPayments", "canAccessAccountsPayable"].some(p => hasPermission(actor, p as "canManagePurchases"))) throw new PurchaseError("FORBIDDEN", "Sin permiso para consultar opciones de pago", 403)
  const control = await prisma.cashControl.findUnique({ where: { accountId: actor.accountId }, select: { enabled: true, treasuryAccountId: true } })
  const accounts = await prisma.treasuryAccount.findMany({ where: { accountId: actor.accountId, isActive: true, currency: "DOP" }, select: { id: true, name: true, type: true, currency: true }, orderBy: [{ name: "asc" }, { id: "asc" }] })
  return { methods: ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"], accounts: accounts.map(a => ({ ...a, cashControlEnabled: control?.enabled ?? false, cashControlled: control?.treasuryAccountId === a.id })) }
}
