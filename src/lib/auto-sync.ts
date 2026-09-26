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
import { clientStorageKeys, getMigratedLocalStorageItem, legacyStorageKey } from "./client-storage"

const CACHE_SYNC_KEY = clientStorageKeys.cacheSync
let activeCacheSync: Promise<boolean> | null = null

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

async function hasActiveSessionForCacheSync(): Promise<boolean> {
  try {
    // Preventivo: el sincronizador también se ejecuta desde el POS y al recuperar
    // conexión. Confirmar la sesión aquí evita que esas vías invoquen una Server
    // Action protegida después de que la caja se haya cerrado o vencido.
    const response = await fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
    })
    if (!response.ok) return false

    const payload: unknown = await response.json()
    return Boolean(
      payload &&
        typeof payload === "object" &&
        "user" in payload &&
        (payload as { user?: unknown }).user
    )
  } catch {
    // Una comprobación de sesión fallida no debe impedir usar el caché offline
    // ni convertirse en una llamada de sincronización que termine en un 500.
    return false
  }
}

// Verificar si necesita sincronizar el cache
async function shouldSyncCache(): Promise<boolean> {
  if (typeof window === "undefined") return false
  
  const lastSyncRaw = getMigratedLocalStorageItem(CACHE_SYNC_KEY, legacyStorageKey("cacheSync"))
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

  // Preventivo: el shell, el POS y el evento "online" pueden pedir la misma
  // carga a la vez. Unificamos la petición para no disparar acciones de servidor
  // redundantes (ni errores de autenticación repetidos durante una transición).
  if (activeCacheSync) return activeCacheSync

  activeCacheSync = (async () => {
    try {
      // Verificar si necesita sincronizar
      if (!(await shouldSyncCache())) {
        console.log("[AutoSync] Cache aún está actualizado, no es necesario sincronizar")
        return false
      }

      if (!(await hasActiveSessionForCacheSync())) {
        console.warn("[AutoSync] Se omitió la sincronización: no hay una sesión activa")
        return false
      }

      console.log("[AutoSync] Sincronizando cache de datos...")

      const [productsData, customersData, arData] = await Promise.all([
        syncProductsToIndexedDB(),
        syncCustomersToIndexedDB(),
        syncARToIndexedDB(),
      ])

      // La sesión puede vencer mientras viajan las peticiones. No sobrescribir
      // ningún store ni marcar éxito cuando una de las acciones devuelve null.
      if (productsData === null || customersData === null || arData === null) {
        console.warn("[AutoSync] Sesión vencida durante la precarga; se conserva el caché")
        return false
      }

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
  })()

  try {
    return await activeCacheSync
  } finally {
    activeCacheSync = null
  }
}

// Inicializar auto-sincronización
export function initAutoSync() {
  if (typeof window === "undefined") return () => undefined

  // Sincronizar al cargar la página si está online
  let initialSyncTimer: ReturnType<typeof setTimeout> | undefined
  if (navigator.onLine) {
    // Esperar un poco para que la app termine de cargar
    initialSyncTimer = setTimeout(() => {
      void syncCacheData()
    }, 2000)
  }

  // Sincronizar cuando vuelve la conexión
  const handleOnline = () => {
    console.log("[AutoSync] Conexión restaurada, sincronizando cache...")
    void syncCacheData()
  }
  window.addEventListener("online", handleOnline)

  return () => {
    // Preventivo: evita que un temporizador o listener de una sesión ya cerrada
    // ejecute acciones protegidas después de desmontar AppShell.
    if (initialSyncTimer) clearTimeout(initialSyncTimer)
    window.removeEventListener("online", handleOnline)
  }
}
