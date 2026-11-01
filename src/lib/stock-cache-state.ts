// Un pendiente confirmado deja de reservar stock solo cuando el caché se ha
// refrescado. Si se pierde la red entre ambos pasos, es obligatorio sincronizar.
const prefix = "movopos:stock-dirty:"
export function stockCacheToken(accountId: string): string | null {
  try { return localStorage.getItem(`${prefix}${accountId}`) }
  catch { return "storage-unavailable" }
}
export function invalidateStockCache(accountId: string) {
  localStorage.setItem(`${prefix}${accountId}`, crypto.randomUUID())
  window.dispatchEvent(new Event("stock-cache-changed"))
}
export function acknowledgeStockCache(accountId: string, token: string | null) {
  // No limpiar una invalidación que llegó mientras la consulta estaba en vuelo.
  if (stockCacheToken(accountId) === token) localStorage.removeItem(`${prefix}${accountId}`)
  window.dispatchEvent(new Event("stock-cache-changed"))
}

export function hasDirtyStockCache() {
  for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(prefix)) return true
  return false
}

export function notifyStockAvailability() {
  // IndexedDB no emite eventos entre pestañas. La reserva durable es la fuente
  // de verdad; esta señal solo hace que las demás pestañas vuelvan a consultarla.
  try { localStorage.setItem("movopos:stock-availability", crypto.randomUUID()) } catch { /* El guardado conserva su reserva en IndexedDB. */ }
  window.dispatchEvent(new Event("stock-cache-changed"))
}
