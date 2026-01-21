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
const CACHE_SYNC_INTERVAL = 1000 * 60 * 30 // 30 minutos

// Verificar si necesita sincronizar el cache
async function shouldSyncCache(): Promise<boolean> {
  if (typeof window === "undefined") return false
  
  const lastSync = localStorage.getItem(CACHE_SYNC_KEY)
  if (!lastSync) return true
  
  const lastSyncTime = parseInt(lastSync, 10)
  const now = Date.now()
  const isExpired = now - lastSyncTime > CACHE_SYNC_INTERVAL
  if (isExpired) return true

  const [products, customers, arItems] = await Promise.all([
    getProductsCache(),
    getCustomersCache(),
    getARCache(),
  ])

  if (products.length === 0 || customers.length === 0 || arItems.length === 0) {
    return true
  }
  
  // Sincronizar si han pasado más de 30 minutos desde la última sincronización
  return now - lastSyncTime > CACHE_SYNC_INTERVAL
}

// Marcar que se sincronizó el cache
function markCacheSynced() {
  if (typeof window === "undefined") return
  localStorage.setItem(CACHE_SYNC_KEY, Date.now().toString())
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
