"use client"

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
  applyLegalTip?: boolean
  discountMode?: "AUTO" | "MANUAL"
  manualDiscountPercentBp?: number
  salePricesIncludeItbis?: boolean
  username: string
  createdAt: number
}) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_SALES, "readwrite")
  tx.objectStore(STORES.PENDING_SALES).put(sale)
  await waitForTransaction(tx)
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
      cursor.delete()
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
      if (arIds.some((id) => id === arId)) {
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
  const tx = db.transaction(STORES.PRODUCTS_CACHE, "readwrite")
  const store = tx.objectStore(STORES.PRODUCTS_CACHE)
  
  // Limpiar cache anterior
  await store.clear()
  
  // Guardar nuevos productos
  for (const product of products) {
    await store.put(product)
  }
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
