"use client"

import type { getCashContext } from "@/lib/cash-shifts"
import type { CashOperationInput } from "@/lib/cash-context"

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
export type CashQueuedOperation = { id: string; kind: "sale" | "payment" | "batchPayment" | "purchase" | "ocrPurchase" | "expense" | "return" | "transfer"; payload: Record<string, unknown>; cashOperation: CashOperationInput; error?: string }
type DocumentResult = { id?: string; reference?: string; invoiceCode?: string; returnCode?: string; stockDecrements?: Array<{ ingredientId: string; qty: number }>; paymentId?: string; paymentIds?: string[] }
type SubmitResult = { pending: true; result: null } | { pending: false; result: DocumentResult }
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
async function enqueue(context: CashContext, kind: CashQueuedOperation["kind"], payload: Record<string, unknown>, bindToShift: boolean) {
  if (!bindToShift) {
    const db = await database(), tx = db.transaction("outbox", "readwrite"), id = crypto.randomUUID()
    const record: CashQueuedOperation = { id, kind, payload: JSON.parse(JSON.stringify(payload)), cashOperation: { accountId: context.accountId, userId: context.userId, clientOperationId: id, cashShiftId: null, clientSequence: null } }
    tx.objectStore("outbox").put(record)
    await completed(tx)
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
    operation = { id, kind, payload: JSON.parse(JSON.stringify(payload)), cashOperation: { accountId: context.accountId, userId: context.userId, cashShiftId: shift.id, clientOperationId: id, clientSequence: sequence } }
    state.put({ key, value: { sequence, frozen: false } })
    outbox.put(operation)
  }
  await completed(tx).catch(error => { throw failure ?? error })
  return operation!
}
async function confirm(record: CashQueuedOperation, result: unknown) {
  const db = await database(), tx = db.transaction(["state", "outbox"], "readwrite")
  tx.objectStore("state").put({ key: `receipt:${record.id}`, value: result })
  tx.objectStore("outbox").delete(record.id)
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
export async function submitControlledDocument(kind: CashQueuedOperation["kind"], payload: Record<string, unknown>, actor?: { id: string; accountId: string }): Promise<SubmitResult | undefined> {
  const { context, connected } = await resolveCashContext(actor)
  const posOperation = ["sale", "payment", "batchPayment"].includes(kind)
  if (posOperation) assertCashShiftAccess(context, actor)
  if (!context?.enabled) return undefined
  if (!posOperation && !connected) throw new Error("Necesitas conexión para registrar esta operación")
  const shift = context.activeShift
  const cashAccount = payload.treasuryAccountId === context.treasuryAccountId || payload.refundTreasuryAccountId === context.treasuryAccountId || payload.paymentMethod === "EFECTIVO" || payload.refundMethod === "EFECTIVO" || payload.fromTreasuryAccountId === context.treasuryAccountId || payload.toTreasuryAccountId === context.treasuryAccountId
  const holder = Boolean(shift?.isMine && shift.isDevice && shift.status === "OPEN")
  if (cashAccount && (!context.canOperate || !holder)) throw new CashShiftAccessError(context, "Abre tu turno en Cuadre diario desde este dispositivo antes de usar la caja")
  if (shift?.isMine && shift.isDevice && shift.status !== "OPEN") throw new CashShiftAccessError(context, "Termina o reanuda el cierre antes de registrar operaciones")
  const record = await enqueue(context, kind, payload, holder)
  if (navigator.onLine) {
    try { await syncCashOutbox(context) }
    catch { /* El pendiente ya es durable: mostrar guardado pendiente, nunca volver a crearlo. */ }
  }
  const result = await readState<DocumentResult>(`receipt:${record.id}`)
  window.dispatchEvent(new Event("cash-outbox-changed"))
  return result === undefined ? { result: null, pending: true } : { result, pending: false }
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
