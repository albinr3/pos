"use client"

import { blockOfflineWritesForDeletion, clearAllOfflineDataForDeletion } from "@/lib/indexed-db"

export const ACCOUNT_DELETION_EVENT = "movopos-account-deletion"

export function isAccountCleanupPending() {
  try { return localStorage.getItem(ACCOUNT_DELETION_EVENT) !== null } catch { return false }
}

export function notifyAccountDeletion(status: "completada" | "procesando") {
  blockOfflineWritesForDeletion()
  try { localStorage.setItem(ACCOUNT_DELETION_EVENT, JSON.stringify({ status, at: Date.now() })) } catch { /* La limpieza local sigue siendo necesaria. */ }
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(ACCOUNT_DELETION_EVENT)
    channel.postMessage({ status })
    channel.close()
  }
}

export async function clearAccountLocalData() {
  blockOfflineWritesForDeletion()
  const tasks: Promise<unknown>[] = [clearAllOfflineDataForDeletion()]
  for (const getStorage of [() => localStorage, () => sessionStorage]) {
    try {
      const storage = getStorage()
      for (const key of Object.keys(storage)) {
        if (key !== ACCOUNT_DELETION_EVENT && (/^(movopos|tejada-pos)/.test(key) || ["posCartState", "posViewMode", "quotesViewMode", "billing-proof-pending"].includes(key))) storage.removeItem(key)
      }
    } catch { /* IndexedDB y los otros almacenes se limpian independientemente. */ }
  }
  if (typeof caches !== "undefined") tasks.push(caches.keys().then(keys => Promise.all(keys.filter(key => /^(pos-|movopos-|tejada-pos-)/.test(key)).map(key => caches.delete(key)))))
  const results = await Promise.allSettled(tasks)
  if (results.some(result => result.status === "rejected")) throw new Error("No se pudieron limpiar los datos locales")
  try { localStorage.removeItem(ACCOUNT_DELETION_EVENT) } catch { /* No contiene datos del negocio. */ }
}
