"use client"

import { invalidateStockCache, notifyStockAvailability } from "./stock-cache-state"
import type { StockConsumption } from "./pos-stock"

import type { getCashContext } from "@/lib/cash-shifts"
import type { CashOperationInput } from "@/lib/cash-context"
import type { ShiftReportSnapshot } from "@/lib/cash-shift-report-types"

export type CashContext = Awaited<ReturnType<typeof getCashContext>>
export type CashActorIdentity = { id: string; accountId: string }
export class CashShiftAccessError extends Error {
  constructor(public context: CashContext | undefined, message: string) { super(message); this.name = "CashShiftAccessError" }
}
class CashContextRequestError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export function cashShiftBlockReason(context: CashContext, actor?: CashActorIdentity): string | null {
  if (actor && (actor.id !== context.userId || actor.accountId !== context.accountId)) return "El empleado cambió. Recarga la página para continuar con la sesión actual."
  if (!context.enabled) return null
  if (!context.canOperate) return "Necesitas el permiso de abrir y cerrar tu turno de caja. Solicítalo al dueño del negocio."
  const shift = context.activeShift
  if (!shift) return "Antes de facturar o cobrar, cuenta el efectivo que recibes y abre tu turno."
  if (!shift.isMine) return `La caja tiene un turno de ${shift.cashierName}. Ese turno debe cerrarse antes de que puedas abrir el tuyo.`
  if (!shift.isDevice) return "Tu turno está abierto en otro dispositivo. Usa el dispositivo donde lo abriste o revisa el turno en Cuadre diario."
  if (shift.status !== "OPEN") return "Tu turno se está cerrando. Termina o reanuda el cierre en Cuadre diario antes de facturar o cobrar."
  return null
}
export function assertCashShiftAccess(context: CashContext, actor?: CashActorIdentity) {
  const reason = cashShiftBlockReason(context, actor)
  if (reason) throw new CashShiftAccessError(context, reason)
}
export type CashQueuedOperation = { id: string; kind: "sale" | "payment" | "batchPayment" | "purchase" | "ocrPurchase" | "supplierPayment" | "foreignPayment" | "expense" | "fiscalExpense" | "employeeExpenseSettlement" | "return" | "fiscalCredit" | "fiscalFinancialCredit" | "fiscalDebit" | "applyFiscalCustomerCredit" | "transfer"; payload: Record<string, unknown>; stockConsumptions?: StockConsumption[]; reportAmountCents?: number; reportCreatedAt?: string; cashOperation: CashOperationInput; error?: string }
type DocumentResult = { id?: string; reference?: string; invoiceCode?: string; returnCode?: string; documentId?: string; eNcf?: string; stockDecrements?: Array<{ ingredientId: string; qty: number }>; paymentId?: string; paymentIds?: string[] }
type SubmitResult = { pending: true; result: null; error?: string } | { pending: false; result: DocumentResult }
type ManualInput = { shiftId: string; kind: string; amountCents: number; otherAccountId?: string; note: string }
type ManualPending = { accountId: string; userId: string; input: ManualInput; body: ManualInput & { action: string; operationId: string } }
const DB_NAME = "movopos-cash-v1"
let opening: Promise<IDBDatabase> | undefined
function database() {
  return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore("state", { keyPath: "key" })
      request.result.createObjectStore("outbox", { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { opening = undefined; reject(request.error) }
  })
}
function value<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
}
function completed(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("No se pudo guardar el pendiente de caja")) })
}
async function readState<T = unknown>(key: string): Promise<T | undefined> {
  const db = await database()
  return (await value(db.transaction("state").objectStore("state").get(key)))?.value
}
async function writeState(key: string, data: unknown) {
  const db = await database(), tx = db.transaction("state", "readwrite")
  tx.objectStore("state").put({ key, value: data })
  await completed(tx)
}
export async function refreshCashContext(): Promise<CashContext> {
  const response = await fetch("/api/cash-shifts", { cache: "no-store" })
  const data = await response.json()
  if (!response.ok) throw new CashContextRequestError(response.status, data.error ?? "No se pudo consultar el turno")
  await writeState("context", data)
  if (data.activeShift?.isMine && data.activeShift.isDevice) void refreshCashShiftReport(data).catch(() => {})
  return data
}
export async function cachedCashContext(): Promise<CashContext | undefined> { return readState<CashContext>("context") }
export async function resolveCashContext(actor?: CashActorIdentity) {
  let context = await cachedCashContext(), connected = false
  if (navigator.onLine) {
    try { context = await refreshCashContext(); connected = true }
    catch (error) {
      // Una sesión rechazada no es una desconexión: no habilitar formularios con permisos cacheados.
      if (error instanceof CashContextRequestError && error.status < 500) throw new CashShiftAccessError(undefined, error.message)
      if (!context) throw new CashShiftAccessError(undefined, "No se pudo comprobar la caja. Conéctate e inténtalo de nuevo.")
    }
  }
  if (!context) throw new CashShiftAccessError(undefined, "Conéctate para comprobar la caja antes de facturar o cobrar.")
  if (actor && (actor.id !== context.userId || actor.accountId !== context.accountId)) throw new CashShiftAccessError(undefined, "El empleado cambió. Recarga la página para continuar con la sesión actual.")
  return { context, connected }
}
export async function cashPending(): Promise<CashQueuedOperation[]> {
  const db = await database()
  return value(db.transaction("outbox").objectStore("outbox").getAll())
}
type ReportLocalOperation = { id: string; kind: string; payload: Record<string, unknown>; status: "pending" | "confirmed"; error?: string; reference?: string; amountCents?: number; recordedAt?: string }
const reportKey = (context: CashContext) => `report:${context.accountId}:${context.userId}:${context.activeShift?.id}`
const reportJournalPrefix = (context: CashContext) => `report-op:${context.accountId}:${context.userId}:${context.activeShift?.id}:`
const closedReportKey = (context: CashContext) => `report-closed:${context.accountId}:${context.userId}:${context.activeShift?.id}`

export async function refreshCashShiftReport(context: CashContext): Promise<ShiftReportSnapshot> {
  const shift = context.activeShift
  if (!shift?.isMine || !shift.isDevice) throw new Error("Usa el usuario y dispositivo del responsable del turno")
  const response = await fetch(`/api/cash-shifts?view=report&shiftId=${encodeURIComponent(shift.id)}`, { cache: "no-store" })
  // Un rechazo de sesión HTML tampoco es una desconexión que permita mostrar datos cacheados.
  if (!response.ok) {
    const failure = await response.json().catch(() => ({})) as { error?: string }
    throw new CashContextRequestError(response.status, failure.error ?? "No se pudo consultar el detalle")
  }
  const report: ShiftReportSnapshot = await response.json()
  if (report.accountId !== context.accountId || report.userId !== context.userId || report.shiftId !== shift.id || !Array.isArray(report.movements) || !Array.isArray(report.confirmedOperationIds)) throw new Error("El detalle no corresponde al turno actual")
  const db = await database(), tx = db.transaction("state", "readwrite"), state = tx.objectStore("state")
  let accepted = false
  const current = state.get("context")
  current.onsuccess = () => {
    const active = current.result?.value as CashContext | undefined
    // Una respuesta tardía nunca debe restaurar datos del empleado o del turno anterior.
    if (active?.accountId !== context.accountId || active.userId !== context.userId || active.activeShift?.id !== shift.id || !active.activeShift.isMine || !active.activeShift.isDevice) return
    const closed = state.get(closedReportKey(context))
    closed.onsuccess = () => {
      // Una respuesta de reporte iniciada antes del cierre no debe restaurar su copia después de eliminarla.
      if (closed.result?.value) return
      accepted = true
      const previous = state.get(reportKey(context))
      previous.onsuccess = () => {
        if (previous.result?.value?.generatedAt > report.generatedAt) return
        state.put({ key: reportKey(context), value: report })
        for (const id of report.confirmedOperationIds) state.delete(`${reportJournalPrefix(context)}${id}`)
      }
    }
  }
  await completed(tx)
  if (!accepted) throw new Error("El turno o empleado cambió; actualiza antes de imprimir")
  return report
}

export async function loadCashShiftReport(context: CashContext, actor: CashActorIdentity) {
  const shift = context.activeShift
  if (!shift?.isMine || !shift.isDevice || context.accountId !== actor.accountId || context.userId !== actor.id) throw new Error("El detalle solo está disponible para el responsable de este turno y dispositivo")
  let onlineSnapshot = false
  if (navigator.onLine) {
    try { await refreshCashShiftReport(context); onlineSnapshot = true }
    catch (error) { if (error instanceof CashContextRequestError && error.status < 500) throw error }
  }
  const db = await database(), tx = db.transaction(["state", "outbox"], "readonly")
  const state = tx.objectStore("state"), outbox = tx.objectStore("outbox")
  // Leer cola, confirmaciones y movimiento manual en el mismo corte evita perder una respuesta concurrente.
  const [cached, current, allState, allPending, manualRow] = await Promise.all([value(state.get(reportKey(context))), value(state.get("context")), value(state.getAll()), value(outbox.getAll()), value(state.get(`manual:${shift.id}`))])
  await completed(tx)
  const active = current?.value as CashContext | undefined
  if (active?.accountId !== actor.accountId || active.userId !== actor.id || active.activeShift?.id !== shift.id || !active.activeShift.isMine || !active.activeShift.isDevice) throw new Error("El turno o empleado cambió; actualiza antes de imprimir")
  const snapshot = cached?.value as ShiftReportSnapshot | undefined
  const confirmed = new Set(snapshot?.confirmedOperationIds ?? [])
  const pending: ReportLocalOperation[] = (allPending as CashQueuedOperation[]).filter(row => row.cashOperation.accountId === actor.accountId && row.cashOperation.userId === actor.id && row.cashOperation.cashShiftId === shift.id && !confirmed.has(row.id)).map(row => ({ id: row.id, kind: row.kind, payload: row.payload, status: "pending", error: row.error, amountCents: row.reportAmountCents, recordedAt: row.reportCreatedAt }))
  const journal: ReportLocalOperation[] = allState.filter(row => typeof row.key === "string" && row.key.startsWith(reportJournalPrefix(context)) && !confirmed.has(row.value?.id)).map(row => row.value)
  const manual = manualRow?.value as ManualPending | undefined
  if (manual?.accountId === actor.accountId && manual.userId === actor.id && !confirmed.has(manual.body.operationId)) pending.push({ id: manual.body.operationId, kind: "manual", payload: { ...manual.input }, status: "pending" })
  const seen = new Set(pending.map(row => row.id))
  const local = [...pending, ...journal.filter(row => !seen.has(row.id))]
  const sequenceGap = !!snapshot && snapshot.finalSequence !== null && snapshot.lastSequence !== snapshot.finalSequence
  return { snapshot, context, local, provisional: !onlineSnapshot || !snapshot || local.length > 0 || sequenceGap, generatedAt: new Date().toISOString() }
}
export async function clearCashShiftReport(context: CashContext) {
  if (!context.activeShift) return
  const db = await database(), tx = db.transaction("state", "readwrite"), state = tx.objectStore("state")
  const keys = state.getAllKeys(), prefix = reportJournalPrefix(context), snapshot = reportKey(context)
  state.put({ key: closedReportKey(context), value: true })
  keys.onsuccess = () => {
    // Solo limpiar el reporte tras un cierre confirmado; la cola y sus recibos nunca se eliminan aquí.
    for (const key of keys.result) if (typeof key === "string" && (key === snapshot || key.startsWith(prefix))) state.delete(key)
  }
  await completed(tx)
}
async function enqueue(context: CashContext, kind: CashQueuedOperation["kind"], payload: Record<string, unknown>, bindToShift: boolean, stockConsumptions?: StockConsumption[], reportAmountCents?: number) {
  // Una caché anterior no identifica la política: no inventar una versión para una operación nueva.
  if (!context.fiscalQueuePolicy || !Number.isSafeInteger(context.fiscalQueuePolicy.version)) throw new Error("Conéctate para comprobar la política fiscal antes de guardar el pendiente")
  const hasFiscalSelection = (kind === "sale" && Object.hasOwn(payload, "fiscal")) || kind === "fiscalCredit" || kind === "fiscalFinancialCredit" || kind === "fiscalDebit" || kind === "fiscalExpense" || kind === "foreignPayment"
  const isCollection = kind === "payment" || kind === "batchPayment" || kind === "applyFiscalCustomerCredit" || kind === "employeeExpenseSettlement"
  // Una reposición mueve fondos entre cuentas y no crea otro gasto fiscal.
  const isPurchaseFlow = kind === "purchase" || kind === "supplierPayment" || kind === "transfer"
  // La cola nunca convierte una venta entre perfiles al perder conexión o cambiar de empresa.
  if ((context.fiscalQueuePolicy.enabled && !hasFiscalSelection && !isCollection && !isPurchaseFlow) || (!context.fiscalQueuePolicy.enabled && hasFiscalSelection)) throw new Error("La política fiscal cambió; conserva el carrito y vuelve a comprobar la configuración")
  if (hasFiscalSelection && payload.fiscal && (payload.fiscal as { expectedPolicyVersion?: unknown }).expectedPolicyVersion !== context.fiscalQueuePolicy.version) throw new Error("La política fiscal cambió; revisa el comprobante antes de guardarlo")
  if ((kind === "fiscalCredit" || kind === "fiscalFinancialCredit" || kind === "fiscalDebit") && payload.expectedPolicyVersion !== context.fiscalQueuePolicy.version) throw new Error("La política fiscal cambió; conserva la nota para revisión")
  if ((kind === "fiscalExpense" || kind === "foreignPayment") && payload.expectedPolicyVersion !== context.fiscalQueuePolicy.version) throw new Error("La política fiscal cambió; revisa la operación")
  const fiscalPolicyVersion = context.fiscalQueuePolicy.version
  if (!bindToShift) {
    const db = await database(), tx = db.transaction("outbox", "readwrite"), id = crypto.randomUUID()
    const record: CashQueuedOperation = { id, kind, payload: JSON.parse(JSON.stringify(payload)), stockConsumptions, reportAmountCents, reportCreatedAt: new Date().toISOString(), cashOperation: { accountId: context.accountId, userId: context.userId, clientOperationId: id, cashShiftId: null, clientSequence: null, fiscalPolicyVersion } }
    tx.objectStore("outbox").put(record)
    await completed(tx)
    if (kind === "sale") notifyStockAvailability()
    return record
  }
  const shift = context.activeShift!
  const db = await database()
  const tx = db.transaction(["state", "outbox"], "readwrite")
  const state = tx.objectStore("state"), outbox = tx.objectStore("outbox")
  const key = `shift:${shift.id}`
  let failure: Error | undefined
  let operation: CashQueuedOperation
  // La lectura, la secuencia y el pendiente se confirman juntos en IndexedDB, también entre pestañas.
  const request = state.get(key)
  request.onsuccess = () => {
    const current = request.result?.value ?? { sequence: shift.lastSequence ?? 0, frozen: false }
    if (current.frozen) { failure = new CashShiftAccessError(context, "El turno se está cerrando. Reanúdalo en Cuadre diario para seguir operando."); tx.abort(); return }
    // Tras perder el estado local, recuperar la secuencia del servidor en vez de guardar NaN.
    const localSequence = Number.isSafeInteger(current.sequence) ? current.sequence : 0
    const sequence = Math.max(localSequence, shift.lastSequence ?? 0) + 1
    const id = crypto.randomUUID()
    operation = { id, kind, payload: JSON.parse(JSON.stringify(payload)), stockConsumptions, reportAmountCents, reportCreatedAt: new Date().toISOString(), cashOperation: { accountId: context.accountId, userId: context.userId, cashShiftId: shift.id, clientOperationId: id, clientSequence: sequence, fiscalPolicyVersion } }
    state.put({ key, value: { sequence, frozen: false } })
    outbox.put(operation)
  }
  await completed(tx).catch(error => { throw failure ?? error })
  if (kind === "sale") notifyStockAvailability()
  return operation!
}
async function confirm(record: CashQueuedOperation, result: unknown) {
  if (record.kind === "sale" || record.kind === "fiscalCredit") invalidateStockCache(record.cashOperation.accountId)
  const db = await database(), tx = db.transaction(["state", "outbox"], "readwrite")
  const state = tx.objectStore("state"), outbox = tx.objectStore("outbox")
  state.put({ key: `receipt:${record.id}`, value: result })
  const existing = outbox.get(record.id)
  existing.onsuccess = () => {
    // Una respuesta tardía no debe resucitar como cobro un pendiente ya anulado o confirmado.
    if (!existing.result) return
    if (record.cashOperation.cashShiftId && !(result as { discarded?: boolean } | null)?.discarded) {
      const { accountId, userId, cashShiftId } = record.cashOperation
      // Guardar la confirmación en la misma transacción que borra la cola evita perderla antes de refrescar el reporte.
      state.put({ key: `report-op:${accountId}:${userId}:${cashShiftId}:${record.id}`, value: { id: record.id, kind: record.kind, payload: record.payload, status: "confirmed", reference: (result as DocumentResult | null)?.invoiceCode ?? (result as DocumentResult | null)?.returnCode, amountCents: record.reportAmountCents, recordedAt: record.reportCreatedAt } })
    }
    outbox.delete(record.id)
  }
  await completed(tx)
  window.dispatchEvent(new Event("cash-outbox-changed"))
}
async function storeError(record: CashQueuedOperation, error: string) {
  const db = await database(), tx = db.transaction("outbox", "readwrite")
  const store = tx.objectStore("outbox"), request = store.get(record.id)
  // Otra pestaña puede haber confirmado o anulado el pendiente mientras llegaba este error.
  // Actualizar solo si todavía existe; nunca resucitar una operación ya resuelta.
  request.onsuccess = () => { if (request.result) store.put({ ...request.result, error }) }
  await completed(tx)
}
async function flush(context: CashContext) {
  const records = (await cashPending()).filter(r => r.cashOperation.accountId === context.accountId && r.cashOperation.userId === context.userId).sort((a, b) => (a.cashOperation.clientSequence ?? 0) - (b.cashOperation.clientSequence ?? 0))
  for (const record of records) {
    // Enviar también permite recuperar la respuesta de un commit anterior; el servidor nunca reasigna el turno.
    const response = await fetch("/api/cash-shifts/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) })
    const data = await response.json()
    if (!response.ok) { await storeError(record, data.error ?? "No se pudo sincronizar"); throw new Error(data.error ?? "No se pudo sincronizar") }
    await confirm(record, data.result)
  }
}
export async function syncCashOutbox(context?: CashContext) {
  if (!navigator.onLine) throw new Error("Necesitas conexión para sincronizar la caja")
  const current = context ?? await refreshCashContext()
  const work = () => flush(current)
  if (navigator.locks) await navigator.locks.request(`cash-sync:${current.accountId}`, work)
  else await work()
}
export async function submitControlledDocument(kind: CashQueuedOperation["kind"], payload: Record<string, unknown>, actor?: { id: string; accountId: string }, stockConsumptions?: StockConsumption[], reportAmountCents?: number): Promise<SubmitResult | undefined> {
  if (kind === "sale" && Array.isArray(payload.items) && payload.items.some(item => {
    const qty = Number((item as { qty?: unknown }).qty)
    return !Number.isFinite(qty) || Math.abs(qty * 100 - Math.round(qty * 100)) > 1e-8
  })) throw new Error("La cantidad vendida admite como máximo dos decimales.")
  const { context, connected } = await resolveCashContext(actor)
  const posOperation = ["sale", "payment", "batchPayment", "fiscalCredit", "fiscalFinancialCredit", "fiscalDebit", "applyFiscalCustomerCredit"].includes(kind)
  if (posOperation) assertCashShiftAccess(context, actor)
  // Ventas y cobros sin turnos también usan una cola idempotente con autoría y política verificables.
  if (!context.enabled && !posOperation) return undefined
  if ((kind === "fiscalFinancialCredit" || kind === "fiscalDebit") && !connected) throw new Error("Necesitas conexión para registrar una nota financiera")
  if ((kind === "fiscalExpense" || kind === "employeeExpenseSettlement" || kind === "foreignPayment") && !connected) throw new Error("Necesitas conexión para registrar esta operación")
  if (kind === "applyFiscalCustomerCredit" && !connected) throw new Error("Necesitas conexión para aplicar un saldo a favor")
  if (!posOperation && !connected) throw new Error("Necesitas conexión para registrar esta operación")
  const shift = context.activeShift
  // SupplierPayment usa method: también debe exigir turno antes de encolar un pago en efectivo.
  const cashAccount = payload.treasuryAccountId === context.treasuryAccountId || payload.refundTreasuryAccountId === context.treasuryAccountId || payload.paymentMethod === "EFECTIVO" || payload.method === "EFECTIVO" || payload.refundMethod === "EFECTIVO" || payload.fromTreasuryAccountId === context.treasuryAccountId || payload.toTreasuryAccountId === context.treasuryAccountId
  const holder = Boolean(context.enabled && shift?.isMine && shift.isDevice && shift.status === "OPEN")
  if (context.enabled && cashAccount && (!context.canOperate || !holder)) throw new CashShiftAccessError(context, "Abre tu turno en Cuadre diario desde este dispositivo antes de usar la caja")
  if (context.enabled && shift?.isMine && shift.isDevice && shift.status !== "OPEN") throw new CashShiftAccessError(context, "Termina o reanuda el cierre antes de registrar operaciones")
  const record = await enqueue(context, kind, payload, holder, stockConsumptions, reportAmountCents)
  if (navigator.onLine) {
    try { await syncCashOutbox(context) }
    catch { /* El pendiente ya es durable: mostrar guardado pendiente, nunca volver a crearlo. */ }
  }
  const result = await readState<DocumentResult>(`receipt:${record.id}`)
  window.dispatchEvent(new Event("cash-outbox-changed"))
  // Un rechazo de negocio se conserva en la cola y debe explicarse; repetir el carrito crearía otro identificador.
  const queued = result === undefined && ((kind === "sale" && Object.hasOwn(payload, "fiscal")) || kind === "fiscalCredit" || kind === "fiscalFinancialCredit" || kind === "fiscalDebit" || kind === "applyFiscalCustomerCredit" || kind === "fiscalExpense" || kind === "employeeExpenseSettlement" || kind === "foreignPayment") ? (await cashPending()).find(item => item.id === record.id) : undefined
  return result === undefined ? { result: null, pending: true, ...(queued?.error ? { error: queued.error } : {}) } : { result, pending: false }
}
export async function freezeCashShift(context: CashContext) {
  const shift = context.activeShift!
  const db = await database(), tx = db.transaction("state", "readwrite")
  const store = tx.objectStore("state"), key = `shift:${shift.id}`
  let finalSequence = 0
  let failure: Error | undefined
  const request = store.get(key)
  request.onsuccess = () => {
    const old = request.result?.value ?? { sequence: shift.lastSequence ?? 0 }
    const manual = store.get(`manual:${shift.id}`)
    manual.onsuccess = () => {
      if (manual.result?.value) { failure = new Error("Reintenta el movimiento de caja pendiente antes de preparar el cierre"); tx.abort(); return }
      finalSequence = Math.max(Number.isSafeInteger(old.sequence) ? old.sequence : 0, shift.lastSequence ?? 0)
      store.put({ key, value: { sequence: finalSequence, frozen: true } })
    }
  }
  await completed(tx).catch(e => { throw failure ?? e })
  return finalSequence
}
export async function unfreezeCashShift(shiftId: string) {
  const db = await database(), tx = db.transaction("state", "readwrite")
  const store = tx.objectStore("state"), key = `shift:${shiftId}`, request = store.get(key)
  // Conservar la secuencia más reciente si otra pestaña ya reanudó y agregó una venta.
  request.onsuccess = () => store.put({ key, value: { sequence: 0, ...(request.result?.value ?? {}), frozen: false } })
  await completed(tx)
}
export async function discardCashPending(id: string, reason: string) {
  if (!reason.trim()) throw new Error("Explica por qué anulas el pendiente")
  const record = (await cashPending()).find(r => r.id === id)
  if (!record) return
  const response = await fetch("/api/cash-shifts/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "discard", cashOperation: record.cashOperation, payload: { reason, originalKind: record.kind, originalPayload: record.payload } }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  // Conservar el contenido descartado y su motivo: nunca perder silenciosamente una venta.
  await writeState(`discarded:${id}`, { ...record, reason })
  await confirm(record, data.result)
}
export async function manualCashPending(shiftId: string) { return readState<ManualPending | null>(`manual:${shiftId}`) }
async function settleManualMovement(key: string, operationId: string, failure?: unknown) {
  const db = await database(), tx = db.transaction("state", "readwrite"), store = tx.objectStore("state")
  const request = store.get(key)
  request.onsuccess = () => {
    // Una respuesta anterior no puede borrar el movimiento siguiente creado desde otra pestaña.
    if (request.result?.value?.body.operationId !== operationId) return
    if (failure === undefined) {
      const entry = request.result.value as ManualPending
      store.put({ key: `report-op:${entry.accountId}:${entry.userId}:${entry.input.shiftId}:${operationId}`, value: { id: operationId, kind: "manual", payload: { ...entry.input }, status: "confirmed" } })
    }
    if (failure !== undefined) store.put({ key: `manual-failed:${operationId}`, value: failure })
    store.put({ key, value: null })
  }
  await completed(tx)
}
export async function sendManualCashMovement(input: ManualInput) {
  const context = await refreshCashContext()
  const key = `manual:${input.shiftId}`
  const db = await database(), tx = db.transaction("state", "readwrite")
  const store = tx.objectStore("state")
  let body: ManualPending["body"] | undefined, failure: Error | undefined
  const request = store.get(`shift:${input.shiftId}`)
  request.onsuccess = () => {
    if (request.result?.value?.frozen) { failure = new Error("Reanuda el turno antes de registrar movimientos"); tx.abort(); return }
    const existing = store.get(key)
    existing.onsuccess = () => {
      const previous = existing.result?.value
      if (previous) {
        if (previous.userId !== context.userId || previous.accountId !== context.accountId) { failure = new Error("Vuelve al empleado que registró el movimiento pendiente"); tx.abort(); return }
        if (JSON.stringify(previous.input) !== JSON.stringify(input)) { failure = new Error("Reintenta el movimiento pendiente antes de registrar otro"); tx.abort(); return }
        body = previous.body
      } else {
        if (!context.enabled || !context.activeShift?.isMine || !context.activeShift.isDevice || context.activeShift.id !== input.shiftId || context.activeShift.status !== "OPEN") { failure = new Error("Usa el usuario y dispositivo del turno abierto"); tx.abort(); return }
        body = { ...input, action: "movement", operationId: crypto.randomUUID() }
        store.put({ key, value: { accountId: context.accountId, userId: context.userId, input, body } })
      }
    }
  }
  await completed(tx).catch(e => { throw failure ?? e })
  const response = await fetch("/api/cash-shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) {
    // Un 5xx o error sin código puede ocurrir después del commit: conservar el ID para verificarlo al reintentar.
    // Solo un rechazo de negocio explícito permite corregir el formulario sin arriesgar otro retiro.
    if (response.status >= 400 && response.status < 500 && typeof data.code === "string" && data.code !== "CASH_OPERATION_CONFLICT") {
      await settleManualMovement(key, body!.operationId, { input, body, error: data.error })
    }
    throw new Error(data.error)
  }
  await settleManualMovement(key, body!.operationId)
}
