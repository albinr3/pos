"use client"

const DB_NAME = "tejada-pos-offline"
const DB_VERSION = 1

// Store names
const STORES = {
  PENDING_SALES: "pendingSales",
  PENDING_PAYMENTS: "pendingPayments",
  PRODUCTS_CACHE: "productsCache",
  CUSTOMERS_CACHE: "customersCache",
  AR_CACHE: "arCache",
} as const

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB no está disponible"))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

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
    }
  })

  return dbPromise
}

// Pending Sales
export async function savePendingSale(sale: {
  tempId: string
  customerId: string | null
  type: "CONTADO" | "CREDITO"
  paymentMethod?: string | null
  paymentSplits?: Array<{ method: string; amountCents: number }>
  items: Array<{
    productId: string
    qty: number
    unitPriceCents: number
    wasPriceOverridden: boolean
  }>
  shippingCents?: number
  username: string
  createdAt: number
}) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_SALES, "readwrite")
  await tx.objectStore(STORES.PENDING_SALES).put(sale)
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
  await tx.objectStore(STORES.PENDING_SALES).delete(tempId)
}

// Pending Payments
export async function savePendingPayment(payment: {
  tempId: string
  arId: string
  amountCents: number
  method: string
  note?: string | null
  username: string
  createdAt: number
}) {
  const db = await openDB()
  const tx = db.transaction(STORES.PENDING_PAYMENTS, "readwrite")
  await tx.objectStore(STORES.PENDING_PAYMENTS).put(payment)
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
  await tx.objectStore(STORES.PENDING_PAYMENTS).delete(tempId)
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
    localStorage.removeItem("tejada-pos-cache-sync")
  }
}

export async function getPendingCounts() {
  const [sales, payments] = await Promise.all([
    getPendingSales(),
    getPendingPayments(),
  ])
  return {
    sales: sales.length,
    payments: payments.length,
  }
}
