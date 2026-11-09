"use client"

import { hasFiscalInput } from "./fiscal/core/input"

import type { StockConsumption } from "./pos-stock"
import { notifyStockAvailability } from "./stock-cache-state"

const DB_NAME = "movopos-offline"
const LEGACY_DB_NAME = "tejada-pos-offline"
const DB_VERSION = 4

// Store names
const STORES = {
  PENDING_SALES: "pendingSales",
  PENDING_PAYMENTS: "pendingPayments",
  PENDING_BATCH_PAYMENTS: "pendingBatchPayments",
  PRODUCTS_CACHE: "productsCache",
  CUSTOMERS_CACHE: "customersCache",
  AR_CACHE: "arCache",
  MIGRATION_META: "migrationMeta",
} as const

const DATA_STORES = [
  STORES.PENDING_SALES,
  STORES.PENDING_PAYMENTS,
  STORES.PENDING_BATCH_PAYMENTS,
  STORES.PRODUCTS_CACHE,
  STORES.CUSTOMERS_CACHE,
  STORES.AR_CACHE,
] as const

const LEGACY_MIGRATION_KEY = "legacy-brand-storage-v1"

let dbPromise: Promise<IDBDatabase> | null = null
let accountDeletionStarted = false

export function blockOfflineWritesForDeletion() { accountDeletionStarted = true }
function assertOfflineWritesAllowed() {
  // Una sincronización que terminó tarde no puede repoblar los datos recién eliminados.
  if (accountDeletionStarted) throw new Error("La cuenta está en proceso de eliminación")
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Error en transacción IndexedDB"))
    tx.onabort = () => reject(tx.error ?? new Error("Transacción IndexedDB abortada"))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Error en IndexedDB"))
  })
}

function openCurrentDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion

      // Crear stores si no existen
      if (!db.objectStoreNames.contains(STORES.PENDING_SALES)) {
        const salesStore = db.createObjectStore(STORES.PENDING_SALES, {
          keyPath: "tempId",
        })
        salesStore.createIndex("createdAt", "createdAt", { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.PENDING_PAYMENTS)) {
        const paymentsStore = db.createObjectStore(STORES.PENDING_PAYMENTS, {
          keyPath: "tempId",
        })
        paymentsStore.createIndex("createdAt", "createdAt", { unique: false })
        paymentsStore.createIndex("arId", "arId", { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.PENDING_BATCH_PAYMENTS)) {
        const batchPaymentsStore = db.createObjectStore(STORES.PENDING_BATCH_PAYMENTS, {
          keyPath: "tempId",
        })
        batchPaymentsStore.createIndex("createdAt", "createdAt", { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.PRODUCTS_CACHE)) {
        const productsStore = db.createObjectStore(STORES.PRODUCTS_CACHE, {
          keyPath: "id",
        })
        productsStore.createIndex("name", "name", { unique: false })
        productsStore.createIndex("sku", "sku", { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.CUSTOMERS_CACHE)) {
        const customersStore = db.createObjectStore(STORES.CUSTOMERS_CACHE, {
          keyPath: "id",
        })
        customersStore.createIndex("name", "name", { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.AR_CACHE)) {
        const arStore = db.createObjectStore(STORES.AR_CACHE, {
          keyPath: "id",
        })
        arStore.createIndex("customerId", "customerId", { unique: false })
        arStore.createIndex("saleId", "saleId", { unique: true })
      }

      if (!db.objectStoreNames.contains(STORES.MIGRATION_META)) {
        db.createObjectStore(STORES.MIGRATION_META, { keyPath: "key" })
      }

      if (oldVersion < 2) {
        // Limpiar estructuras legacy para forzar cache y pendientes con el nuevo shape.
        if (db.objectStoreNames.contains(STORES.PENDING_SALES)) {
          request.transaction?.objectStore(STORES.PENDING_SALES).clear()
        }
        if (db.objectStoreNames.contains(STORES.PRODUCTS_CACHE)) {
          request.transaction?.objectStore(STORES.PRODUCTS_CACHE).clear()
        }
      }
    }
  })
}

async function legacyDatabaseExists() {
  // No abrir la base anterior si no existe: hacerlo la crearía vacía en instalaciones nuevas.
  if (typeof indexedDB.databases !== "function") return false
  const databases = await indexedDB.databases()
  return databases.some((database) => database.name === LEGACY_DB_NAME)
}

async function readLegacyRecords() {
  const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la base anterior"))
  })

  try {
    const availableStores = DATA_STORES.filter((store) => legacyDb.objectStoreNames.contains(store))
    if (availableStores.length === 0) return new Map<string, unknown[]>()

    const transaction = legacyDb.transaction(availableStores, "readonly")
    const records = await Promise.all(
      availableStores.map(async (store) => [store, await requestResult(transaction.objectStore(store).getAll())] as const),
    )
    await waitForTransaction(transaction)
    return new Map(records)
  } finally {
    legacyDb.close()
  }
}

async function migrateLegacyDatabase(db: IDBDatabase) {
  const checkTransaction = db.transaction(STORES.MIGRATION_META, "readonly")
  const previousMigration = await requestResult(
    checkTransaction.objectStore(STORES.MIGRATION_META).get(LEGACY_MIGRATION_KEY),
  )
  await waitForTransaction(checkTransaction)
  if (previousMigration) return

  const records = (await legacyDatabaseExists()) ? await readLegacyRecords() : new Map<string, unknown[]>()
  const transaction = db.transaction([...DATA_STORES, STORES.MIGRATION_META], "readwrite")

  for (const [store, items] of records) {
    const targetStore = transaction.objectStore(store)
    for (const item of items) targetStore.put(item)
  }

  // Comentario preventivo: marcamos la migración solo tras copiar los pendientes. Así una venta
  // sin conexión no se pierde ni se vuelve a restaurar después de que el usuario la haya enviado.
  transaction.objectStore(STORES.MIGRATION_META).put({ key: LEGACY_MIGRATION_KEY, completedAt: Date.now() })
  await waitForTransaction(transaction)
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = (async () => {
    if (typeof window === "undefined" || !window.indexedDB) {
      throw new Error("IndexedDB no está disponible")
    }

    const db = await openCurrentDatabase()
    await migrateLegacyDatabase(db)
    return db
  })()

  return dbPromise
}

// Pending Sales
export async function savePendingSale(sale: {
  accountId?: string
  userId?: string
  stockConsumptions?: StockConsumption[]
  tempId: string
  customerId: string | null
  type: "CONTADO" | "CREDITO"
  paymentMethod?: string | null
  transferBankName?: string | null
  treasuryAccountId?: string | null
  paymentSplits?: Array<{ method: string; amountCents: number; transferBankName?: string | null; treasuryAccountId?: string | null }>
  items: Array<{
    productId: string
    qty: number
    unitPriceCents: number
    wasPriceOverridden: boolean
    recipeAdjustments?: Array<{
      ingredientId: string
      adjustmentType: "SIN" | "EXTRA"
    }>
  }>
  shippingCents?: number
  notes?: string | null
  applyLegalTip?: boolean
  discountMode?: "AUTO" | "MANUAL"
  manualDiscountPercentBp?: number
  salePricesIncludeItbis?: boolean
  username: string
  createdAt: number
}) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_SALES, "readwrite")
  assertOfflineWritesAllowed()
  tx.objectStore(STORES.PENDING_SALES).put(sale)
  await waitForTransaction(tx)
  notifyStockAvailability()
  window.dispatchEvent(new Event("pending-sales-changed"))
}

export async function getPendingSales(): Promise<any[]> {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_SALES, "readonly")
  const store = tx.objectStore(STORES.PENDING_SALES)
  const index = store.index("createdAt")
  return new Promise((resolve, reject) => {
    const request = index.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function deletePendingSale(tempId: string) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_SALES, "readwrite")
  tx.objectStore(STORES.PENDING_SALES).delete(tempId)
  await waitForTransaction(tx)
  notifyStockAvailability()
  window.dispatchEvent(new Event("pending-sales-changed"))
}

// Pending Payments
export async function savePendingPayment(payment: {
  tempId: string
  arId: string
  amountCents: number
  method: string
  transferBankName?: string | null
  treasuryAccountId?: string | null
  note?: string | null
  username: string
  createdAt: number
}) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_PAYMENTS, "readwrite")
  assertOfflineWritesAllowed()
  tx.objectStore(STORES.PENDING_PAYMENTS).put(payment)
  await waitForTransaction(tx)
}

export async function getPendingPayments(): Promise<any[]> {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_PAYMENTS, "readonly")
  const store = tx.objectStore(STORES.PENDING_PAYMENTS)
  const index = store.index("createdAt")
  return new Promise((resolve, reject) => {
    const request = index.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function deletePendingPayment(tempId: string) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_PAYMENTS, "readwrite")
  tx.objectStore(STORES.PENDING_PAYMENTS).delete(tempId)
  await waitForTransaction(tx)
}

export async function deletePendingPaymentsByArId(arId: string) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_PAYMENTS, "readwrite")
  const store = tx.objectStore(STORES.PENDING_PAYMENTS)
  const index = store.index("arId")

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(IDBKeyRange.only(arId))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }
      // Una limpieza de pagos ordinarios no debe borrar otro pendiente con datos fiscales.
      if (!hasFiscalInput(cursor.value)) cursor.delete()
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })

  await waitForTransaction(tx)
}

// Pending Batch Payments
export async function savePendingBatchPayment(payment: {
  tempId: string
  arIds: string[]
  amountCents: number
  method: string
  transferBankName?: string | null
  treasuryAccountId?: string | null
  note?: string | null
  username: string
  createdAt: number
}) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_BATCH_PAYMENTS, "readwrite")
  assertOfflineWritesAllowed()
  tx.objectStore(STORES.PENDING_BATCH_PAYMENTS).put(payment)
  await waitForTransaction(tx)
}

export async function getPendingBatchPayments(): Promise<any[]> {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_BATCH_PAYMENTS, "readonly")
  const store = tx.objectStore(STORES.PENDING_BATCH_PAYMENTS)
  const index = store.index("createdAt")
  return new Promise((resolve, reject) => {
    const request = index.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export type LegacyReviewKind = "sale" | "payment" | "batchPayment"
export type LegacyReviewItem = { kind: LegacyReviewKind; id: string; createdAt: number | null; detail: string }
const legacyReviewStores = { sale: STORES.PENDING_SALES, payment: STORES.PENDING_PAYMENTS, batchPayment: STORES.PENDING_BATCH_PAYMENTS } as const

export async function getReviewableLegacyPending(actor: { id: string; accountId: string; isOwner?: boolean }): Promise<LegacyReviewItem[]> {
  const [sales, payments, batchPayments, products] = await Promise.all([getPendingSales(), getPendingPayments(), getPendingBatchPayments(), getProductsCache()])
  const groups = [sales, payments, batchPayments]
  const names = new Map(products.filter(product => product.accountId === actor.accountId).map(product => [product.id, product.name]))
  const kinds: LegacyReviewKind[] = ["sale", "payment", "batchPayment"]
  return groups.flatMap((rows, index) => rows.flatMap((row: Record<string, unknown>) => {
    // Solo el dueño puede revisar otro empleado o autor desconocido de su propia empresa; no se reasigna el documento.
    if (!row || typeof row !== "object" || row.accountId !== actor.accountId || (row.userId !== actor.id && !actor.isOwner) || typeof row.tempId !== "string" || row.cashOperation) return []
    // Los registros antiguos pueden estar incompletos: un artículo corrupto no debe ocultar toda la revisión.
    const items = Array.isArray(row.items) ? row.items.map((value: unknown) => { const item = value && typeof value === "object" ? value as Record<string, unknown> : {}; const name = names.get(item.productId); return `${name ? `${String(name)} (${String(item.productId)})` : String(item.productId ?? "Producto desconocido")}: ${String(item.qty ?? "?")} × ${String(item.unitPriceCents ?? "?")} centavos` }).join(", ") : ""
    const author = row.userId === actor.id ? "" : ` · Autor original: ${typeof row.userId === "string" ? row.userId : "no registrado"}`
    const saleOptions = index === 0 ? ` · Pago: ${String(row.paymentMethod ?? "no registrado")} · Cliente: ${String(row.customerId ?? "general")} · Descuento: ${String(row.discountMode ?? "no registrado")}${typeof row.manualDiscountPercentBp === "number" ? ` (${row.manualDiscountPercentBp / 100} %)` : ""} · Propina: ${row.applyLegalTip === true ? "sí" : row.applyLegalTip === false ? "no" : "no registrada"}` : ""
    const detail = (index === 0 ? `Venta ${String(row.type ?? "")} · ${items || "sin detalle"} · Flete: ${String(row.shippingCents ?? 0)} centavos` : `Cobro de ${String(row.amountCents ?? "?")} centavos · ${index === 1 ? String(row.arId ?? "cuenta desconocida") : (Array.isArray(row.arIds) ? row.arIds.join(", ") : "cuentas desconocidas")}`) + saleOptions + (typeof row.note === "string" && row.note ? ` · Nota: ${row.note}` : typeof row.notes === "string" && row.notes ? ` · Nota: ${row.notes}` : "") + author
    return [{ kind: kinds[index], id: row.tempId, createdAt: typeof row.createdAt === "number" ? row.createdAt : null, detail }]
  }))
}

export async function retireReviewedLegacyPending(actor: { id: string; accountId: string }, kind: LegacyReviewKind, id: string, reason: string) {
  if (!reason.trim() || !Object.hasOwn(legacyReviewStores, kind)) throw new Error("Indica el motivo de la revisión")
  const { refreshCashContext } = await import("./cash-offline")
  const context = await refreshCashContext()
  if (context.accountId !== actor.accountId || context.userId !== actor.id) throw new Error("La sesión cambió; vuelve a abrir la revisión")
  const db = await openDB(), storeName = legacyReviewStores[kind]
  const record = await requestResult(db.transaction(storeName).objectStore(storeName).get(id))
  // El dueño revisa sin convertirse en autor original; el servidor registra al revisor y la copia anterior.
  if (!record || record.accountId !== actor.accountId || (record.userId !== actor.id && !context.isOwner) || record.cashOperation) throw new Error("El pendiente no está disponible para este empleado")
  const original = JSON.stringify(record)
  // El mismo contenido y motivo producen la misma identidad si se perdió la respuesta de auditoría.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([kind, id, reason.trim(), original])))
  const operationId = `legacy-review-${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`
  const response = await fetch("/api/cash-shifts/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "discard", cashOperation: { accountId: actor.accountId, userId: actor.id, clientOperationId: operationId, cashShiftId: null, clientSequence: null }, payload: { reason: reason.trim(), originalKind: `legacy-${kind}`, originalPayload: record } }) })
  const data = await response.json()
  if (!response.ok || !data.result?.discarded) throw new Error(data.error ?? "No se pudo registrar la revisión")
  assertOfflineWritesAllowed()
  const tx = db.transaction(storeName, "readwrite"), pending = tx.objectStore(storeName), current = pending.get(id)
  let removed = false
  // Una respuesta tardía no debe borrar una operación modificada por otra pestaña.
  current.onsuccess = () => { if (!accountDeletionStarted && current.result && JSON.stringify(current.result) === original) { pending.delete(id); removed = true } }
  await waitForTransaction(tx)
  if (!removed) throw new Error("El pendiente cambió durante la revisión; vuelve a consultarlo")
  notifyStockAvailability()
  window.dispatchEvent(new Event("pending-sales-changed"))
}

export async function deletePendingBatchPayment(tempId: string) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_BATCH_PAYMENTS, "readwrite")
  tx.objectStore(STORES.PENDING_BATCH_PAYMENTS).delete(tempId)
  await waitForTransaction(tx)
}

export async function deletePendingBatchPaymentsByArId(arId: string) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_BATCH_PAYMENTS, "readwrite")
  const store = tx.objectStore(STORES.PENDING_BATCH_PAYMENTS)

  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }

      const value = cursor.value as { arIds?: unknown }
      const arIds = Array.isArray(value?.arIds) ? value.arIds : []
      if (arIds.some((id) => id === arId) && !hasFiscalInput(value)) {
        cursor.delete()
      }
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })

  await waitForTransaction(tx)
}

// Products Cache
export async function saveProductsCache(products: any[]) {
  const db = await openDB()
  assertOfflineWritesAllowed()
  const tx = db.transaction(STORES.PRODUCTS_CACHE, "readwrite")
  const store = tx.objectStore(STORES.PRODUCTS_CACHE)
  store.clear()
  for (const product of products) store.put(product)
  await waitForTransaction(tx)
  notifyStockAvailability()
  window.dispatchEvent(new Event("products-cache-changed"))
}

export async function getProductsCache(): Promise<any[]> {
  const db = await openDB()
  const tx = db.transaction(STORES.PRODUCTS_CACHE, "readonly")
  const store = tx.objectStore(STORES.PRODUCTS_CACHE)
  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function searchProductsCache(query: string): Promise<any[]> {
  const db = await openDB()
  const tx = db.transaction(STORES.PRODUCTS_CACHE, "readonly")
  const store = tx.objectStore(STORES.PRODUCTS_CACHE)
  const allProducts = await new Promise<any[]>((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  if (!query.trim()) return allProducts

  const q = query.toLowerCase()
  return allProducts.filter(
    (p) =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.reference?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q)
  )
}

export async function findProductByBarcodeCache(code: string): Promise<any | null> {
  const trimmed = code.trim().toLowerCase()
  if (!trimmed) return null

  const products = await getProductsCache()
  const match = products.find(
    (p) =>
      (p.sku && String(p.sku).toLowerCase() === trimmed) ||
      (p.reference && String(p.reference).toLowerCase() === trimmed)
  )
  return match || null
}

// Customers Cache
export async function saveCustomersCache(customers: any[]) {
  const db = await openDB()
  assertOfflineWritesAllowed()
  const tx = db.transaction(STORES.CUSTOMERS_CACHE, "readwrite")
  const store = tx.objectStore(STORES.CUSTOMERS_CACHE)
  
  // Limpiar cache anterior
  await store.clear()
  
  // Guardar nuevos clientes
  for (const customer of customers) {
    await store.put(customer)
  }
}

export async function getCustomersCache(): Promise<any[]> {
  const db = await openDB()
  const tx = db.transaction(STORES.CUSTOMERS_CACHE, "readonly")
  const store = tx.objectStore(STORES.CUSTOMERS_CACHE)
  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function searchCustomersCache(query: string): Promise<any[]> {
  const db = await openDB()
  const tx = db.transaction(STORES.CUSTOMERS_CACHE, "readonly")
  const store = tx.objectStore(STORES.CUSTOMERS_CACHE)
  const allCustomers = await new Promise<any[]>((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  if (!query.trim()) return allCustomers

  const q = query.toLowerCase()
  return allCustomers.filter(
    (c) =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.cedula?.toLowerCase().includes(q)
  )
}

// AR Cache
export async function saveARCache(arItems: any[]) {
  const db = await openDB()
  assertOfflineWritesAllowed()
  const tx = db.transaction(STORES.AR_CACHE, "readwrite")
  const store = tx.objectStore(STORES.AR_CACHE)
  
  // Limpiar cache anterior
  await store.clear()
  
  // Guardar nuevos items
  for (const item of arItems) {
    await store.put(item)
  }
}

export async function getARCache(): Promise<any[]> {
  const db = await openDB()
  const tx = db.transaction(STORES.AR_CACHE, "readonly")
  const store = tx.objectStore(STORES.AR_CACHE)
  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getARCacheBySaleId(saleId: string): Promise<any | null> {
  const db = await openDB()
  const tx = db.transaction(STORES.AR_CACHE, "readonly")
  const store = tx.objectStore(STORES.AR_CACHE)
  const index = store.index("saleId")
  return new Promise((resolve, reject) => {
    const request = index.get(saleId)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

// Utility functions
export async function clearSyncedData() {
  const db = await openDB()
  
  // Limpiar solo datos pendientes sincronizados (no cache)
  const salesTx = db.transaction(STORES.PENDING_SALES, "readwrite")
  await salesTx.objectStore(STORES.PENDING_SALES).clear()
  
  const paymentsTx = db.transaction(STORES.PENDING_PAYMENTS, "readwrite")
  await paymentsTx.objectStore(STORES.PENDING_PAYMENTS).clear()

  const batchPaymentsTx = db.transaction(STORES.PENDING_BATCH_PAYMENTS, "readwrite")
  await batchPaymentsTx.objectStore(STORES.PENDING_BATCH_PAYMENTS).clear()
}

// Limpiar todo el cache (productos, clientes, AR) - útil después de restaurar un backup
export async function clearAllCache() {
  const db = await openDB()
  
  // Limpiar cache de productos
  const productsTx = db.transaction(STORES.PRODUCTS_CACHE, "readwrite")
  await productsTx.objectStore(STORES.PRODUCTS_CACHE).clear()
  
  // Limpiar cache de clientes
  const customersTx = db.transaction(STORES.CUSTOMERS_CACHE, "readwrite")
  await customersTx.objectStore(STORES.CUSTOMERS_CACHE).clear()
  
  // Limpiar cache de AR
  const arTx = db.transaction(STORES.AR_CACHE, "readwrite")
  await arTx.objectStore(STORES.AR_CACHE).clear()
  
  // También limpiar el timestamp de última sincronización
  if (typeof window !== "undefined") {
    localStorage.removeItem("movopos-cache-sync")
  }
}

export async function clearAllOfflineDataForDeletion() {
  blockOfflineWritesForDeletion()
  const db = await openDB()
  const tx = db.transaction([...DATA_STORES, STORES.MIGRATION_META], "readwrite")
  const completed = waitForTransaction(tx)
  for (const store of DATA_STORES) tx.objectStore(store).clear()
  // Conservar la marca evita volver a importar datos de una base legacy aún abierta en otra pestaña.
  tx.objectStore(STORES.MIGRATION_META).put({ key: LEGACY_MIGRATION_KEY, completedAt: Date.now() })
  await completed

  // Abrir sin versión también funciona en navegadores sin indexedDB.databases().
  const legacy = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME)
    let absent = false
    request.onupgradeneeded = () => { absent = true; request.transaction?.abort() }
    request.onerror = () => absent ? resolve(null) : reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  if (legacy) {
    try {
      const stores = Array.from(legacy.objectStoreNames)
      if (stores.length) {
        const legacyTx = legacy.transaction(stores, "readwrite")
        const finished = waitForTransaction(legacyTx)
        for (const store of stores) legacyTx.objectStore(store).clear()
        await finished
      }
    } finally { legacy.close() }
  }
}

export async function getPendingCounts() {
  const [sales, payments, batchPayments] = await Promise.all([
    getPendingSales(),
    getPendingPayments(),
    getPendingBatchPayments(),
  ])
  return {
    sales: sales.length,
    payments: payments.length + batchPayments.length,
  }
}
