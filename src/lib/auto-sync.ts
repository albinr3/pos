"use client"

import { syncProductsToIndexedDB, syncCustomersToIndexedDB, syncARToIndexedDB } from "@/app/(app)/sync/actions"
import {
  getARCache,
  getCustomersCache,
  getProductsCache,
  saveProductsCache,
  saveCustomersCache,
  saveARCache,
} from "./indexed-db"

const CACHE_SYNC_KEY = "tejada-pos-cache-sync"

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseLastSyncDay(raw: string | null) {
  if (!raw) return null
  if (/^\d+$/.test(raw)) {
    const ts = Number(raw)
    if (!Number.isNaN(ts)) return formatDateKey(new Date(ts))
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return null
}

// Verificar si necesita sincronizar el cache
async function shouldSyncCache(): Promise<boolean> {
  if (typeof window === "undefined") return false
  
  const lastSyncRaw = localStorage.getItem(CACHE_SYNC_KEY)
  const today = formatDateKey(new Date())
  const lastSyncDay = parseLastSyncDay(lastSyncRaw)
  if (!lastSyncDay || lastSyncDay !== today) return true

  const [products, customers, arItems] = await Promise.all([
    getProductsCache(),
    getCustomersCache(),
    getARCache(),
  ])

  return products.length === 0 || customers.length === 0 || arItems.length === 0
}

// Marcar que se sincronizó el cache
export function markCacheSynced() {
  if (typeof window === "undefined") return
  localStorage.setItem(CACHE_SYNC_KEY, formatDateKey(new Date()))
}

// Sincronizar datos del cache (productos, clientes, AR)
export async function syncCacheData() {
  if (typeof window === "undefined" || !navigator.onLine) {
    console.log("[AutoSync] Sin conexión, no se puede sincronizar cache")
    return false
  }

  // Verificar si necesita sincronizar
  if (!(await shouldSyncCache())) {
    console.log("[AutoSync] Cache aún está actualizado, no es necesario sincronizar")
    return false
  }

  try {
    console.log("[AutoSync] Sincronizando cache de datos...")
    
    const [productsData, customersData, arData] = await Promise.all([
      syncProductsToIndexedDB(),
      syncCustomersToIndexedDB(),
      syncARToIndexedDB(),
    ])
    
    await Promise.all([
      saveProductsCache(productsData),
      saveCustomersCache(customersData),
      saveARCache(arData),
    ])
    
    markCacheSynced()
    console.log("[AutoSync] Cache sincronizado exitosamente")
    return true
  } catch (error) {
    console.error("[AutoSync] Error sincronizando cache:", error)
    return false
  }
}

// Inicializar auto-sincronización
export function initAutoSync() {
  if (typeof window === "undefined") return

  // Sincronizar al cargar la página si está online
  if (navigator.onLine) {
    // Esperar un poco para que la app termine de cargar
    setTimeout(() => {
      syncCacheData()
    }, 2000)
  }

  // Sincronizar cuando vuelve la conexión
  window.addEventListener("online", () => {
    console.log("[AutoSync] Conexión restaurada, sincronizando cache...")
    syncCacheData()
  })
}
