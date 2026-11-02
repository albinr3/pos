import type { CashShift, Prisma, User } from "@prisma/client"
import { getRawPrismaClient, prisma } from "@/lib/db"
import { cashHash, cashRequest, CashControlError } from "@/lib/cash-context"
import { cents, difference, documentLegs, shiftCollectionsByMethod, type MoneyDocument } from "@/lib/cash-money"
import { hasPermission, type PermissionKey } from "@/lib/permissions"
import { endOfDay } from "@/lib/dates"

type Actor = Pick<User, "id" | "accountId" | "name" | "isOwner"> & Partial<User>
const raw = () => getRawPrismaClient()
const canManage = (actor: Actor) => hasPermission(actor, "canManageCashShifts")
const canViewAll = (actor: Actor) => hasPermission(actor, "canViewAllCashShifts")
function permit(value: boolean) { if (!value) throw new CashControlError("CASH_FORBIDDEN", "No tienes permiso para esta acción de caja", 403) }
async function transaction<T>(actor: Actor, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return raw().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${actor.accountId} FOR NO KEY UPDATE`
    return fn(tx)
  }, { timeout: 20000, maxWait: 5000 })
}
async function audit(tx: Prisma.TransactionClient, actor: Actor, event: string, resourceId: string, details: object = {}) {
  await tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.id, userUsername: actor.username, userEmail: actor.email, action: "SETTINGS_CHANGED", resourceType: "CashShift", resourceId, details: { event, ...details } } })
}
async function legacySnapshot(tx: Prisma.TransactionClient, accountId: string) {
  const [accounts, sales, payments, purchases, expenses, returns, transfers, openings, supplierPayments] = await Promise.all([
    tx.treasuryAccount.findMany({ where: { accountId }, orderBy: { id: "asc" } }),
    tx.sale.findMany({ where: { accountId, cancelledAt: null }, include: { payments: true } }),
    tx.payment.findMany({ where: { ar: { sale: { accountId } }, cancelledAt: null } }),
    tx.purchase.findMany({ where: { accountId, cancelledAt: null } }),
    tx.operatingExpense.findMany({ where: { accountId, cancelledAt: null } }),
    tx.return.findMany({ where: { accountId, cancelledAt: null }, include: { sale: { select: { type: true } } } }),
    tx.treasuryTransfer.findMany({ where: { accountId } }),
    tx.treasuryOpeningBalance.findMany({ where: { accountId } }),
    tx.supplierPayment.findMany({ where: { accountId, cancelledAt: null } }),
  ])
  function collect<T extends MoneyDocument>(model: string, rows: T[], dateOf: (row: T) => Date, ignore: (row: T) => boolean = () => false) {
    return rows.map(row => ({ date: dateOf(row), legs: documentLegs(model, row), ignore: ignore(row) }))
  }
  const records = [
    ...collect("sale", sales, r => r.soldAt, r => r.type === "CREDITO"),
    ...collect("supplierPayment", supplierPayments, r => r.paidAt),
    ...collect("payment", payments, r => r.paidAt), ...collect("purchase", purchases, r => r.purchasedAt),
    ...collect("operatingExpense", expenses, r => r.expenseDate),
    ...collect("return", returns, r => r.returnedAt, r => r.sale.type === "CREDITO"),
    ...collect("treasuryTransfer", transfers, r => r.transferredAt), ...collect("treasuryOpeningBalance", openings, r => r.effectiveAt),
  ]
  const balances = new Map(accounts.map(a => [a.id, 0]))
  let unclassified = 0
  let future = 0
  // La tesorería legacy usa fin de día UTC-4; una fecha de hoy normalizada a 23:59 no es una operación de mañana.
  const todayEnd = endOfDay().getTime()
  for (const row of records) {
    if (row.date.getTime() > todayEnd) future++
    const legs = row.legs
    if (!legs.length && !row.ignore) unclassified++
    for (const leg of legs) balances.set(leg.treasuryAccountId, cents((balances.get(leg.treasuryAccountId) ?? 0) + leg.amountCents, true))
  }
  const rows = accounts.map(a => ({ id: a.id, name: a.name, type: a.type, isActive: a.isActive, currency: a.currency, balanceCents: balances.get(a.id) ?? 0 }))
  return { accounts: rows, unclassified, future, previewToken: cashHash(JSON.stringify(rows) + unclassified + ":" + future) }
}
export async function previewCashActivation(actor: Actor) {
  permit(canManage(actor))
  return transaction(actor, tx => activationSnapshot(tx, actor.accountId))
}
async function activationSnapshot(tx: Prisma.TransactionClient, accountId: string) {
  const control = await tx.cashControl.findUnique({ where: { accountId } })
  if (!control) return legacySnapshot(tx, accountId)
  // Al reactivar, el registro conserva las diferencias y reversos: no reconstruir saldos desde documentos antiguos.
  const [accounts, totals] = await Promise.all([
    tx.treasuryAccount.findMany({ where: { accountId }, orderBy: { id: "asc" } }),
    tx.cashMovement.groupBy({ by: ["treasuryAccountId"], where: { accountId }, _sum: { amountCents: true } }),
  ])
  const byId = new Map(totals.map(t => [t.treasuryAccountId, t._sum.amountCents ?? 0]))
  const rows = accounts.map(a => ({ id: a.id, name: a.name, type: a.type, isActive: a.isActive, currency: a.currency, balanceCents: byId.get(a.id) ?? 0 }))
  return { accounts: rows, unclassified: 0, future: 0, previewToken: cashHash(JSON.stringify(rows) + control.ledgerStartedAt.toISOString()) }
}
export async function activateCashControl(actor: Actor, input: { treasuryAccountId: string; countedCents: number; note?: string; previewToken: string }) {
  permit(canManage(actor))
  cents(input.countedCents)
  return transaction(actor, async tx => {
    const existing = await tx.cashControl.findUnique({ where: { accountId: actor.accountId } })
    if (existing) {
      if (existing.treasuryAccountId !== input.treasuryAccountId) throw new CashControlError("CASH_ACCOUNT_PROTECTED", "No se puede cambiar la caja de un registro financiero existente")
      if (existing.enabled) return
      const preview = await activationSnapshot(tx, actor.accountId)
      if (preview.previewToken !== input.previewToken) throw new CashControlError("CASH_PREVIEW_CHANGED", "Los saldos cambiaron. Actualiza la revisión antes de activar")
      const expected = preview.accounts.find(a => a.id === existing.treasuryAccountId)!.balanceCents
      const delta = difference(expected, input.countedCents, input.note)
      if (delta) await tx.cashMovement.create({ data: { recordedAt: new Date(), accountId: actor.accountId, treasuryAccountId: existing.treasuryAccountId, amountCents: delta, sourceType: "ACTIVATION_DIFFERENCE", sourceId: actor.accountId, reference: "Diferencia al reactivar turnos", note: input.note, userId: actor.id } })
      await tx.cashControl.update({ where: { accountId: actor.accountId }, data: { enabled: true } })
      await audit(tx, actor, "CONTROL_ENABLED", actor.accountId, { expected, countedCents: input.countedCents, delta })
      return
    }
    const preview = await legacySnapshot(tx, actor.accountId)
    if (preview.previewToken !== input.previewToken) throw new CashControlError("CASH_PREVIEW_CHANGED", "Los saldos cambiaron. Actualiza la revisión antes de activar")
    if (preview.future) throw new CashControlError("CASH_FUTURE_DOCUMENTS", "Revisa las operaciones con fecha futura antes de activar el control")
    const drawer = preview.accounts.find(a => a.id === input.treasuryAccountId && a.type === "CAJA" && a.isActive && a.currency === "DOP")
    if (!drawer) throw new CashControlError("CASH_ACCOUNT_INVALID", "Selecciona una caja activa en DOP", 400)
    const delta = difference(drawer.balanceCents, input.countedCents, input.note)
    const control = await tx.cashControl.create({ data: { accountId: actor.accountId, treasuryAccountId: drawer.id, enabled: true, ledgerStartedAt: new Date() } })
    for (const account of preview.accounts) await tx.cashMovement.create({ data: { accountId: actor.accountId, treasuryAccountId: account.id, amountCents: account.balanceCents, sourceType: "BASELINE", sourceId: account.id, reference: "Saldo al activar control por turnos", userId: actor.id, recordedAt: control.ledgerStartedAt } })
    if (delta) await tx.cashMovement.create({ data: { recordedAt: new Date(), accountId: actor.accountId, treasuryAccountId: drawer.id, amountCents: delta, sourceType: "ACTIVATION_DIFFERENCE", sourceId: actor.accountId, reference: "Diferencia anterior al control", note: input.note, userId: actor.id } })
    await audit(tx, actor, "CONTROL_ENABLED", actor.accountId, { unclassified: preview.unclassified, delta })
  })
}
export async function disableCashControl(actor: Actor) {
  permit(canManage(actor))
  return transaction(actor, async tx => {
    const control = await tx.cashControl.findUnique({ where: { accountId: actor.accountId } })
    // Activar múltiples turnos es permanente, incluso para el dueño y sin turnos abiertos.
    // Mantener esta protección en el servidor para clientes antiguos y peticiones directas.
    if (control?.enabled) throw new CashControlError("CASH_CONTROL_IRREVERSIBLE", "Múltiples turnos está activado de forma permanente. No puedes volver al modo Turno único", 409)
    // Los registros antiguos desactivados conservan su estado hasta que el negocio los reactive.
  })
}
export async function drawerBalance(tx: Prisma.TransactionClient, accountId: string, treasuryAccountId: string) {
  return (await tx.cashMovement.aggregate({ where: { accountId, treasuryAccountId }, _sum: { amountCents: true } }))._sum.amountCents ?? 0
}
async function expectedForShift(tx: Prisma.TransactionClient, shift: Pick<CashShift, "accountId" | "id" | "treasuryAccountId" | "openingCountedCents">) {
  const flow = await tx.cashMovement.aggregate({ where: { accountId: shift.accountId, cashShiftId: shift.id, treasuryAccountId: shift.treasuryAccountId, sourceType: { notIn: ["OPENING_DIFFERENCE", "CLOSING_DIFFERENCE"] } }, _sum: { amountCents: true } })
  return cents(shift.openingCountedCents + (flow._sum.amountCents ?? 0), true)
}
export async function getCashContext(actor: Actor, deviceHash: string) {
  const db = raw()
  const config = await db.cashControl.findUnique({ where: { accountId: actor.accountId } })
  const active = await db.cashShift.findFirst({ where: { accountId: actor.accountId, status: { in: ["OPEN", "CLOSING"] } } })
  const mayRead = canViewAll(actor) || canManage(actor) || active?.cashierUserId === actor.id
  const groups = active && mayRead ? await db.cashMovement.groupBy({ by: ["treasuryAccountId", "method"], where: { accountId: actor.accountId, cashShiftId: active.id, sourceType: { notIn: ["OPENING_DIFFERENCE", "CLOSING_DIFFERENCE"] } }, _sum: { amountCents: true } }) : []
  const collections = active && mayRead ? await db.cashMovement.groupBy({ by: ["sourceType", "method"], where: { accountId: actor.accountId, cashShiftId: active.id, sourceType: { in: ["sale", "payment"] } }, _sum: { amountCents: true } }) : []
  const names = groups.length ? await db.treasuryAccount.findMany({ where: { accountId: actor.accountId, id: { in: groups.map(g => g.treasuryAccountId) } }, select: { id: true, name: true } }) : []
  const namesById = new Map(names.map(a => [a.id, a.name]))
  return {
    protocolVersion: 1, accountId: actor.accountId, userId: actor.id, userName: actor.name, isOwner: actor.isOwner,
    enabled: config?.enabled ?? false, ledgerStartedAt: config?.ledgerStartedAt ?? null,
    canTransfer: hasPermission(actor, "canCreateTreasuryTransfers"),
    canRecordMovements: hasPermission(actor, "canRecordCashMovements"),
    canCorrect: {
      sale: hasPermission(actor, "canCancelSales"), payment: hasPermission(actor, "canCancelPayments"),
      purchase: hasPermission(actor, "canCancelPurchases"), supplierPayment: hasPermission(actor, "canCancelSupplierPayments"),
      operatingExpense: hasPermission(actor, "canCancelExpenses"), return: hasPermission(actor, "canCancelReturns"),
      treasuryTransfer: hasPermission(actor, "canReverseTreasuryTransfers"),
    },
    breakdown: groups.map(g => ({ accountName: namesById.get(g.treasuryAccountId) ?? "Cuenta", method: g.method, totalCents: g._sum.amountCents ?? 0 })),
    collectionsByMethod: active && mayRead ? shiftCollectionsByMethod(collections.map(g => ({ sourceType: g.sourceType, method: g.method, amountCents: g._sum.amountCents ?? 0 }))) : null,
    treasuryAccountId: config?.treasuryAccountId ?? null,
    canOperate: hasPermission(actor, "canOperateCashShifts"), canViewAll: canViewAll(actor), canManage: canManage(actor),
    expectedOpeningCents: config && !active && hasPermission(actor, "canOperateCashShifts") ? await drawerBalance(db, actor.accountId, config.treasuryAccountId) : null,
    activeShift: active ? {
      id: active.id, status: active.status, cashierName: active.cashierName, isMine: active.cashierUserId === actor.id,
      isDevice: active.deviceHash === deviceHash, openedAt: active.openedAt,
      lastSequence: mayRead ? active.lastSequence : null, finalSequence: mayRead ? active.finalSequence : null,
      openingCountedCents: mayRead ? active.openingCountedCents : null,
      expectedCashCents: mayRead ? await expectedForShift(db, active) : null,
    } : null,
  }
}
const historySelect = { id: true, cashierName: true, openedAt: true, closedAt: true, status: true, openingCountedCents: true, openingDifferenceCents: true, openingNote: true, expectedClosingCents: true, countedClosingCents: true, closingDifferenceCents: true, closingNote: true, closingSnapshot: true } as const
function historyWhere(actor: Actor) {
  return { accountId: actor.accountId, ...(canViewAll(actor) || canManage(actor) ? {} : { cashierUserId: actor.id }) }
}
export async function listCashHistory(actor: Actor, before?: string, limit = 100) {
  // El historial requiere su permiso explícito; operar o administrar caja no debe habilitarlo indirectamente.
  permit(canViewAll(actor))
  const visible = historyWhere(actor)
  const cursor = before ? await raw().cashShift.findFirst({ where: { ...visible, id: before }, select: { id: true, openedAt: true } }) : null
  if (before && !cursor) throw new CashControlError("CASH_SHIFT_NOT_FOUND", "Turno no encontrado", 404)
  // El límite se restringe en el servidor para evitar consultas de historial demasiado grandes.
  return raw().cashShift.findMany({ where: { ...visible, ...(cursor ? { OR: [{ openedAt: { lt: cursor.openedAt } }, { openedAt: cursor.openedAt, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ openedAt: "desc" }, { id: "desc" }], take: Math.max(1, Math.min(100, Math.trunc(limit) || 100)), select: historySelect })
}
export async function getCashReceipt(actor: Actor, id: string) {
  permit(hasPermission(actor, "canOperateCashShifts") || canViewAll(actor) || canManage(actor))
  return raw().cashShift.findFirst({ where: { ...historyWhere(actor), id, status: "CLOSED" }, select: historySelect })
}
export async function getCashShiftReport(actor: Actor, deviceHash: string, id: string) {
  permit(hasPermission(actor, "canOperateCashShifts"))
  return raw().$transaction(async tx => {
    const shift = await tx.cashShift.findFirst({ where: { id, accountId: actor.accountId, cashierUserId: actor.id, deviceHash, status: { in: ["OPEN", "CLOSING"] } } })
    if (!shift || !deviceHash) throw new CashControlError("CASH_SHIFT_NOT_FOUND", "Usa el usuario y dispositivo del turno para consultar su detalle", 404)
    const generatedAt = new Date()
    const [company, movements, sources, operations] = await Promise.all([
      tx.companySettings.findUnique({ where: { accountId: actor.accountId }, select: { name: true, shiftReportPrintFormat: true } }),
      tx.cashMovement.findMany({ where: { accountId: actor.accountId, cashShiftId: shift.id }, include: { treasuryAccount: { select: { name: true } } }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] }),
      tx.cashSourceLink.findMany({ where: { accountId: actor.accountId, cashShiftId: shift.id } }),
      tx.cashOperation.findMany({ where: { accountId: actor.accountId, cashShiftId: shift.id }, select: { clientOperationId: true } }),
    ])
    const paidSuppliers = await tx.supplierPayment.findMany({ where: { accountId: actor.accountId, id: { in: movements.filter(m => m.sourceType === "supplierPayment").map(m => m.sourceId) } }, select: { id: true, supplierName: true } })
    const movementSources = new Set(movements.map(movement => `${movement.sourceType}:${movement.sourceId}`))
    const withoutMovement = sources.filter(source => !movementSources.has(`${source.sourceType}:${source.sourceId}`))
    const ids = (type: string) => withoutMovement.filter(source => source.sourceType === type).map(source => source.sourceId)
    // Consultar por origen, no por movimiento: una factura puede tener varios métodos de pago.
    const movementIds = (type: string) => [...new Set(movements.filter(row => row.sourceType === type).map(row => row.sourceId))]
    const [movementSales, movementPayments, movementReturns] = await Promise.all([
      tx.sale.findMany({ where: { accountId: actor.accountId, id: { in: movementIds("sale") } }, select: { id: true, customer: { select: { name: true } } } }),
      tx.payment.findMany({ where: { id: { in: movementIds("payment") }, ar: { sale: { accountId: actor.accountId } } }, select: { id: true, ar: { select: { customer: { select: { name: true } } } } } }),
      tx.return.findMany({ where: { accountId: actor.accountId, id: { in: movementIds("return") } }, select: { id: true, sale: { select: { customer: { select: { name: true } } } } } }),
    ])
    const customerNames = new Map<string, string | null>([
      ...movementSales.map(row => [`sale:${row.id}`, row.customer?.name ?? null] as const),
      ...movementPayments.map(row => [`payment:${row.id}`, row.ar.customer.name] as const),
      ...movementReturns.map(row => [`return:${row.id}`, row.sale.customer?.name ?? null] as const),
    ])
    const [sales, purchases, expenses, returns, payments] = await Promise.all([
      tx.sale.findMany({ where: { accountId: actor.accountId, id: { in: ids("sale") } }, select: { id: true, invoiceCode: true, totalCents: true, cancelledAt: true, createdAt: true, customer: { select: { name: true } } } }),
      tx.purchase.findMany({ where: { accountId: actor.accountId, id: { in: ids("purchase") } }, select: { id: true, totalCents: true, cancelledAt: true, createdAt: true } }),
      tx.operatingExpense.findMany({ where: { accountId: actor.accountId, id: { in: ids("operatingExpense") } }, select: { id: true, description: true, amountCents: true, cancelledAt: true, createdAt: true } }),
      tx.return.findMany({ where: { accountId: actor.accountId, id: { in: ids("return") } }, select: { id: true, returnCode: true, totalCents: true, cancelledAt: true, createdAt: true, sale: { select: { customer: { select: { name: true } } } } } }),
      tx.payment.findMany({ where: { id: { in: ids("payment") }, ar: { sale: { accountId: actor.accountId } } }, select: { id: true, receiptCode: true, amountCents: true, cancelledAt: true, createdAt: true, ar: { select: { customer: { select: { name: true } } } } } }),
    ])
    const documents = [
      ...sales.map(row => ({ sourceType: "sale", id: row.id, reference: row.invoiceCode, amountCents: row.totalCents, cancelled: !!row.cancelledAt, recordedAt: row.createdAt, customerName: row.customer?.name ?? null })),
      ...purchases.map(row => ({ sourceType: "purchase", id: row.id, reference: row.id, amountCents: row.totalCents, cancelled: !!row.cancelledAt, recordedAt: row.createdAt })),
      ...expenses.map(row => ({ sourceType: "operatingExpense", id: row.id, reference: row.description, amountCents: row.amountCents, cancelled: !!row.cancelledAt, recordedAt: row.createdAt })),
      ...returns.map(row => ({ sourceType: "return", id: row.id, reference: row.returnCode, amountCents: row.totalCents, cancelled: !!row.cancelledAt, recordedAt: row.createdAt, customerName: row.sale.customer?.name ?? null })),
      ...payments.map(row => ({ sourceType: "payment", id: row.id, reference: row.receiptCode, amountCents: row.amountCents, cancelled: !!row.cancelledAt, recordedAt: row.createdAt, customerName: row.ar.customer.name })),
    ]
    // El corte y los identificadores deben proceder de la misma vista para no duplicar respuestas perdidas.
    return { accountId: actor.accountId, userId: actor.id, shiftId: shift.id, cashierName: shift.cashierName, openedAt: shift.openedAt, generatedAt, companyName: company?.name ?? "Mi Negocio", format: company?.shiftReportPrintFormat === "80mm" ? "80mm" as const : "CARTA" as const, openingCents: shift.openingCountedCents, expectedCashCents: await expectedForShift(tx, shift), lastSequence: shift.lastSequence, finalSequence: shift.finalSequence, status: shift.status, confirmedOperationIds: operations.map(operation => operation.clientOperationId), movements: movements.map(row => ({ ...row, customerName: row.sourceType === "supplierPayment" ? paidSuppliers.find(p => p.id === row.sourceId)?.supplierName ?? null : customerNames.get(`${row.sourceType}:${row.sourceId}`) ?? null })), documents }
  }, { isolationLevel: "RepeatableRead", timeout: 20000, maxWait: 5000 })
}
export async function openCashShift(actor: Actor, deviceHash: string, countedCents: number, note?: string) {
  permit(hasPermission(actor, "canOperateCashShifts"))
  if (!deviceHash) throw new CashControlError("CASH_DEVICE_REQUIRED", "Carga primero el contexto de caja en este dispositivo")
  return transaction(actor, async tx => {
    const config = await tx.cashControl.findUnique({ where: { accountId: actor.accountId } })
    if (!config?.enabled) throw new CashControlError("CASH_CONTROL_DISABLED", "El control de turnos está desactivado")
    const active = await tx.cashShift.findFirst({ where: { accountId: actor.accountId, status: { in: ["OPEN", "CLOSING"] } } })
    if (active) throw new CashControlError("CASH_SHIFT_ACTIVE", "Ya hay un turno abierto. Actualiza la pantalla")
    const expected = await drawerBalance(tx, actor.accountId, config.treasuryAccountId)
    const delta = difference(expected, countedCents, note)
    const shift = await tx.cashShift.create({ data: { accountId: actor.accountId, treasuryAccountId: config.treasuryAccountId, cashierUserId: actor.id, cashierName: actor.name, deviceHash, openedAt: new Date(), openingExpectedCents: expected, openingCountedCents: countedCents, openingDifferenceCents: delta, openingNote: note?.trim() || null } })
    if (delta) await tx.cashMovement.create({ data: { recordedAt: new Date(), accountId: actor.accountId, treasuryAccountId: config.treasuryAccountId, cashShiftId: shift.id, sourceType: "OPENING_DIFFERENCE", sourceId: shift.id, reference: "Diferencia de recepción", amountCents: delta, userId: actor.id, note } })
    await audit(tx, actor, "SHIFT_OPENED", shift.id, { expected, countedCents, delta })
    return { id: shift.id }
  })
}
async function ownedShift(tx: Prisma.TransactionClient, actor: Actor, deviceHash: string, id: string) {
  const shift = await tx.cashShift.findFirst({ where: { id, accountId: actor.accountId } })
  if (!shift) throw new CashControlError("CASH_SHIFT_NOT_FOUND", "Turno no encontrado", 404)
  permit(hasPermission(actor, "canOperateCashShifts"))
  if (shift.cashierUserId !== actor.id || shift.deviceHash !== deviceHash) throw new CashControlError("CASH_SHIFT_MISMATCH", "Usa el usuario y dispositivo del responsable del turno")
  return shift
}
export async function prepareCashClose(actor: Actor, deviceHash: string, id: string, finalSequence: number) {
  return transaction(actor, async tx => {
    const shift = await ownedShift(tx, actor, deviceHash, id)
    if (shift.status === "CLOSED") return { closed: true }
    if (!Number.isSafeInteger(finalSequence) || finalSequence < shift.lastSequence) throw new CashControlError("CASH_SEQUENCE_GAP", "La secuencia local no coincide con el turno")
    if (shift.status === "CLOSING" && shift.finalSequence !== finalSequence) throw new CashControlError("CASH_SEQUENCE_GAP", "El cierre ya tiene una secuencia final distinta")
    await tx.cashShift.update({ where: { id }, data: { status: "CLOSING", finalSequence } })
    return { closed: false }
  })
}
export async function cancelCashClose(actor: Actor, deviceHash: string, id: string) {
  return transaction(actor, async tx => {
    const shift = await ownedShift(tx, actor, deviceHash, id)
    if (shift.status === "CLOSED") throw new CashControlError("CASH_SHIFT_CLOSED", "El turno ya está cerrado")
    await tx.cashShift.update({ where: { id }, data: { status: "OPEN", finalSequence: null } })
  })
}
export async function finishCashClose(actor: Actor, deviceHash: string, id: string, input: { countedCents: number; expectedCents: number; note?: string; emergency?: boolean }) {
  return transaction(actor, async tx => {
    const shift = input.emergency ? await tx.cashShift.findFirst({ where: { id, accountId: actor.accountId } }) : await ownedShift(tx, actor, deviceHash, id)
    if (!shift) throw new CashControlError("CASH_SHIFT_NOT_FOUND", "Turno no encontrado", 404)
    if (shift.status === "CLOSED") return { id: shift.id }
    if (input.emergency) { permit(actor.isOwner); if (!input.note?.trim()) throw new Error("Indica el motivo del cierre excepcional y la situación de los pendientes") }
    else if (shift.status !== "CLOSING" || shift.lastSequence !== shift.finalSequence) throw new CashControlError("CASH_PENDING_OPERATIONS", "Sincroniza todos los pendientes antes de cerrar")
    const expected = await expectedForShift(tx, shift)
    if (expected !== input.expectedCents) throw new CashControlError("CASH_EXPECTED_CHANGED", "El importe esperado cambió. Revísalo antes de confirmar")
    const delta = difference(expected, input.countedCents, input.note)
    const movements = await tx.cashMovement.findMany({ where: { accountId: actor.accountId, cashShiftId: id }, include: { treasuryAccount: { select: { name: true } } }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] })
    const sources = await tx.cashSourceLink.findMany({ where: { accountId: actor.accountId, cashShiftId: id } })
    const documents = []
    for (const source of sources) {
      type SnapshotRow = { id: string; invoiceCode?: string; receiptCode?: string; reference?: string; returnCode?: string; description?: string; totalCents?: number; amountCents?: number; type?: string; cancelledAt?: Date | null }
      const delegates = tx as unknown as Record<string, { findFirst(args: { where: { id: string } }): Promise<SnapshotRow | null> }>
      const row = await delegates[source.sourceType].findFirst({ where: { id: source.sourceId } })
      if (row) documents.push({ sourceType: source.sourceType, id: row.id, reference: row.invoiceCode ?? row.receiptCode ?? row.reference ?? row.returnCode ?? row.description ?? row.id, totalCents: row.totalCents ?? row.amountCents ?? 0, type: row.type ?? null, cancelled: Boolean(row.cancelledAt) })
    }
    const snapshot = JSON.parse(JSON.stringify({ movements, documents, emergency: Boolean(input.emergency) }))
    if (delta) await tx.cashMovement.create({ data: { recordedAt: new Date(), accountId: actor.accountId, treasuryAccountId: shift.treasuryAccountId, cashShiftId: id, sourceType: "CLOSING_DIFFERENCE", sourceId: id, reference: "Diferencia de cierre", amountCents: delta, userId: actor.id, note: input.note } })
    await tx.cashShift.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), closedByUserId: actor.id, expectedClosingCents: expected, countedClosingCents: input.countedCents, closingDifferenceCents: delta, closingNote: input.note?.trim() || null, closingSnapshot: snapshot } })
    await audit(tx, actor, input.emergency ? "SHIFT_EMERGENCY_CLOSED" : "SHIFT_CLOSED", id, { expected, countedCents: input.countedCents, delta })
    return { id }
  })
}
export async function manualCashMovement(actor: Actor, deviceHash: string, input: { shiftId: string; operationId: string; kind: "OWNER_IN" | "OWNER_OUT" | "TRANSFER_IN" | "TRANSFER_OUT"; amountCents: number; otherAccountId?: string; note: string }) {
  if (!input.operationId || !input.note?.trim() || !["OWNER_IN", "OWNER_OUT", "TRANSFER_IN", "TRANSFER_OUT"].includes(input.kind)) throw new CashControlError("CASH_MOVEMENT_INVALID", "Indica tipo, identificador y motivo del movimiento", 400)
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 2147483647) throw new CashControlError("CASH_MOVEMENT_INVALID", "El monto debe ser mayor a cero y estar dentro del límite permitido", 400)
  return transaction(actor, async tx => {
    const shift = await ownedShift(tx, actor, deviceHash, input.shiftId)
    const hash = cashHash(JSON.stringify(input))
    const previous = await tx.cashOperation.findUnique({ where: { accountId_clientOperationId: { accountId: actor.accountId, clientOperationId: input.operationId } } })
    if (previous) { if (previous.payloadHash !== hash || previous.userId !== actor.id) throw new CashControlError("CASH_OPERATION_CONFLICT", "Identificador utilizado para otro movimiento"); return }
    if (shift.status !== "OPEN") throw new CashControlError("CASH_SHIFT_CLOSING", "El turno debe estar abierto")
    const sign = input.kind.endsWith("IN") ? 1 : -1
    if (input.kind.startsWith("TRANSFER")) {
      permit(hasPermission(actor, "canCreateTreasuryTransfers"))
      const other = await tx.treasuryAccount.findFirst({ where: { id: input.otherAccountId ?? "", accountId: actor.accountId, isActive: true, currency: "DOP" } })
      if (!other || other.id === shift.treasuryAccountId) throw new CashControlError("CASH_ACCOUNT_INVALID", "Selecciona una cuenta de destino u origen diferente y en DOP", 400)
      const transfer = await tx.treasuryTransfer.create({ data: { accountId: actor.accountId, createdByUserId: actor.id, fromTreasuryAccountId: sign < 0 ? shift.treasuryAccountId : other.id, toTreasuryAccountId: sign < 0 ? other.id : shift.treasuryAccountId, amountCents: input.amountCents, transferredAt: new Date(), note: input.note } })
      await tx.cashSourceLink.create({ data: { accountId: actor.accountId, sourceType: "treasuryTransfer", sourceId: transfer.id, cashShiftId: shift.id } })
      for (const [treasuryAccountId, amountCents] of [[shift.treasuryAccountId, sign * input.amountCents], [other.id, -sign * input.amountCents]] as const) await tx.cashMovement.create({ data: { recordedAt: new Date(), accountId: actor.accountId, treasuryAccountId, cashShiftId: shift.id, amountCents, sourceType: "treasuryTransfer", sourceId: transfer.id, reference: "Traspaso de caja", note: input.note, userId: actor.id } })
    } else {
      permit(hasPermission(actor, "canRecordCashMovements"))
      await tx.cashMovement.create({ data: { recordedAt: new Date(), accountId: actor.accountId, treasuryAccountId: shift.treasuryAccountId, cashShiftId: shift.id, amountCents: sign * input.amountCents, sourceType: input.kind, sourceId: input.operationId, reference: sign > 0 ? "Aporte del propietario" : "Retiro del propietario", note: input.note, userId: actor.id } })
    }
    await tx.cashOperation.create({ data: { accountId: actor.accountId, cashShiftId: shift.id, clientOperationId: input.operationId, userId: actor.id, payloadHash: hash, response: {} } })
    await audit(tx, actor, "CASH_MOVEMENT", shift.id, input)
  })
}
export async function cancelPendingManualCashMovement(actor: Actor, deviceHash: string, input: { shiftId: string; operationId: string; reason: string }) {
  if (!input.operationId?.trim() || !input.reason?.trim()) throw new CashControlError("CASH_MOVEMENT_INVALID", "Identifica el movimiento y explica la anulación", 400)
  return transaction(actor, async tx => {
    const shift = await ownedShift(tx, actor, deviceHash, input.shiftId)
    const previous = await tx.cashOperation.findUnique({ where: { accountId_clientOperationId: { accountId: actor.accountId, clientOperationId: input.operationId } } })
    if (previous) {
      if (previous.userId !== actor.id || previous.cashShiftId !== shift.id) throw new CashControlError("CASH_OPERATION_CONFLICT", "Movimiento de otro turno")
      // El candado del negocio serializa esto con el movimiento original: si ya se confirmó,
      // avisamos al dispositivo; si no, el marcador impide que una respuesta tardía lo cree.
      const cancelled = Boolean(previous.response && typeof previous.response === "object" && !Array.isArray(previous.response) && (previous.response as { cancelled?: boolean }).cancelled)
      return { cancelled, committed: !cancelled }
    }
    await tx.cashOperation.create({ data: { accountId: actor.accountId, cashShiftId: shift.id, clientOperationId: input.operationId, userId: actor.id, payloadHash: cashHash(JSON.stringify({ kind: "manual-discard", reason: input.reason.trim() })), response: { cancelled: true } } })
    await audit(tx, actor, "CASH_MOVEMENT_DISCARDED", shift.id, { operationId: input.operationId, reason: input.reason.trim() })
    return { cancelled: true, committed: false }
  })
}
export async function correctClosedCashDocument(actor: Actor, deviceHash: string, input: { sourceType: string; sourceId: string; moneyMoved: boolean; reason: string }) {
  const permissions: Record<string, PermissionKey> = { sale: "canCancelSales", payment: "canCancelPayments", purchase: "canCancelPurchases", supplierPayment: "canCancelSupplierPayments", operatingExpense: "canCancelExpenses", return: "canCancelReturns", treasuryTransfer: "canReverseTreasuryTransfers" }
  permit(Boolean(permissions[input.sourceType]) && hasPermission(actor, permissions[input.sourceType]))
  if (typeof input.moneyMoved !== "boolean" || !input.reason?.trim()) throw new Error("Indica el motivo y si hubo devolución o recuperación real de dinero")
  const source = await raw().cashSourceLink.findUnique({ where: { accountId_sourceType_sourceId: { accountId: actor.accountId, sourceType: input.sourceType, sourceId: input.sourceId } }, include: { cashShift: true } })
  if (!source || source.cashShift.status !== "CLOSED") throw new Error("Selecciona una operación de un turno cerrado")
  return cashRequest.run({ correction: input, trustedActor: actor, deviceHash }, () => prisma.$transaction(async tx => {
    if (input.sourceType === "sale") { const result = await (await import("@/app/(app)/sales/actions")).cancelSale(input.sourceId, actor.username ?? actor.name, input.reason); if (!result.success) throw new Error(result.error) }
    if (input.sourceType === "payment") await (await import("@/app/(app)/ar/actions")).cancelPayment(input.sourceId, input.reason)
    if (input.sourceType === "supplierPayment") await (await import("@/lib/accounts-payable")).cancelSupplierPayment(actor, input.sourceId, input.reason)
    if (input.sourceType === "purchase") await (await import("@/app/(app)/purchases/actions")).cancelPurchase(input.sourceId)
    if (input.sourceType === "return") await (await import("@/app/(app)/returns/actions")).cancelReturn(input.sourceId)
    if (input.sourceType === "operatingExpense") await (await import("@/app/(app)/operating-expenses/actions")).deleteOperatingExpense(input.sourceId)
    if (input.sourceType === "treasuryTransfer") await (await import("@/app/(app)/treasury/actions")).reverseTreasuryTransfer({ transferId: input.sourceId, reason: input.reason })
    // También conservar el motivo cuando no hubo dinero: no existe un asiento monetario donde guardarlo.
    await tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.id, userUsername: actor.username, userEmail: actor.email, action: "SETTINGS_CHANGED", resourceType: "CashDocumentCorrection", resourceId: input.sourceId, details: { ...input, sourceShiftId: source.cashShiftId } } })
  }, { timeout: 20000, maxWait: 5000 }))
}
