// Renovar los recursos de caja sin tocar IndexedDB ni los pendientes de ventas.
const CACHE_VERSION = "v6"
const STATIC_CACHE = `pos-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `pos-runtime-${CACHE_VERSION}`
const OFFLINE_URL = "/offline.html"
const clientScopes = new Map()
const scopeWrites = new Map()
const scopeEpochs = new Map()
const navigationPrefix = `pos-navigation-${CACHE_VERSION}-`
const scopeCache = `pos-scope-${CACHE_VERSION}`
const scopeKey = (accountId, userId) => `${encodeURIComponent(accountId)}:${encodeURIComponent(userId)}`
const scopeRequest = clientId => new Request(new URL(`/__movopos_scope__/${encodeURIComponent(clientId)}`, self.location.origin))

async function saveClientScope(clientId, scope) {
  if (!clientId) return
  clientScopes.set(clientId, scope)
  const write = (scopeWrites.get(clientId) || Promise.resolve()).catch(() => {}).then(async () => {
    await (await caches.open(scopeCache)).put(scopeRequest(clientId), new Response(scope))
  })
  scopeWrites.set(clientId, write)
  await write
  if (scopeWrites.get(clientId) === write) scopeWrites.delete(clientId)
}

async function clearClientScope(clientId) {
  clientScopes.delete(clientId)
  // Serializar con el guardado evita que una escritura anterior resucite una sesión cerrada.
  const write = (scopeWrites.get(clientId) || Promise.resolve()).catch(() => {}).then(async () => {
    await (await caches.open(scopeCache)).delete(scopeRequest(clientId))
  })
  scopeWrites.set(clientId, write)
  await write
  if (scopeWrites.get(clientId) === write) scopeWrites.delete(clientId)
}

async function readClientScope(clientId) {
  if (!clientId) return undefined
  const inMemory = clientScopes.get(clientId)
  if (inMemory) return inMemory
  if (scopeWrites.has(clientId)) await scopeWrites.get(clientId)
  if (clientScopes.has(clientId)) return clientScopes.get(clientId)
  // El worker puede detenerse entre navegaciones: recuperar solo el contexto de esta pestaña.
  const stored = await (await caches.open(scopeCache)).match(scopeRequest(clientId))
  const scope = stored && await stored.text()
  if (scope) clientScopes.set(clientId, scope)
  return scope || undefined
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL]))
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("pos-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE && key !== scopeCache && !key.startsWith(navigationPrefix))
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return Response.error()
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    return cached
  }

  const networkResponse = await networkPromise
  return networkResponse || Response.error()
}

async function sessionMatches(scope) {
  try {
    // Una sesión lenta no debe dejar la navegación esperando indefinidamente por el caché.
    const response = await fetch("/api/auth/me", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(3000) })
    if (!response.ok) return false
    const { user } = await response.json()
    return !!user && scopeKey(user.accountId, user.id) === scope
  } catch { return false }
}

async function networkFirst(request, clientId, resultingClientId) {
  let scope
  try {
    scope = await readClientScope(clientId)
    if (scope && resultingClientId) await saveClientScope(resultingClientId, scope)
  } catch { /* Sin almacenamiento, la navegación online debe seguir funcionando. */ }
  let response
  try {
    response = await fetch(request)
  } catch {
    try {
      const cached = scope ? await (await caches.open(navigationPrefix + scope)).match(request) : null
      if (cached) return cached
      const offline = await (await caches.open(STATIC_CACHE)).match(OFFLINE_URL)
      if (offline) return offline
    } catch { /* El almacenamiento puede estar deshabilitado. */ }
    return Response.error()
  }
  try {
    // Un error de caché no debe convertir una respuesta de red válida en una página offline.
    if (scope && response.ok && await sessionMatches(scope) && clientScopes.get(clientId) === scope) {
      const cache = await caches.open(navigationPrefix + scope)
      await cache.put(request, response.clone())
    }
  } catch { /* La respuesta online sigue siendo válida aunque falle el almacenamiento. */ }
  return response
}

async function warmNavigationCache(rawUrl, clientId, scope) {
  if (!rawUrl || !scope || !await sessionMatches(scope)) return

  const targetUrl = new URL(rawUrl, self.location.origin)
  if (targetUrl.origin !== self.location.origin) return
  if (targetUrl.pathname.startsWith("/api/") || targetUrl.pathname.startsWith("/_next/")) return

  // Pre-fetch and cache navigations triggered by Next client routing (no SW fetch event).
  const cache = await caches.open(navigationPrefix + scope)
  const request = new Request(targetUrl.toString(), {
    method: "GET",
    credentials: "include",
  })
  const cached = await cache.match(request)
  if (cached) return

  try {
    const response = await fetch(request)
    if (response && response.ok && clientScopes.get(clientId) === scope && await sessionMatches(scope)) {
      await cache.put(request, response.clone())
    }
  } catch {
    // Ignore warmup errors
  }
}

self.addEventListener("message", (event) => {
  const data = event.data
  const clientId = event.source?.id
  if (!data || !clientId) return
  if (data.type === "CLEAR_SCOPE") {
    scopeEpochs.set(clientId, (scopeEpochs.get(clientId) || 0) + 1)
    event.waitUntil(clearClientScope(clientId))
    return
  }
  if (data.type !== "CACHE_URL" || typeof data.accountId !== "string" || typeof data.userId !== "string" || !data.accountId || !data.userId) return
  const scope = scopeKey(data.accountId, data.userId)
  const epoch = (scopeEpochs.get(clientId) || 0) + 1
  scopeEpochs.set(clientId, epoch)
  event.waitUntil((async () => {
    // Un mensaje local no puede asignar a la pestaña el caché de otra sesión.
    if (data.warm) {
      if (!await sessionMatches(scope) || scopeEpochs.get(clientId) !== epoch) return
      await saveClientScope(clientId, scope)
      if (scopeEpochs.get(clientId) !== epoch) return
      await warmNavigationCache(data.url, clientId, scope)
    } else if (await readClientScope(clientId) === scope && scopeEpochs.get(clientId) === epoch) {
      clientScopes.set(clientId, scope)
    }
  })())
})

self.addEventListener("push", (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: "Nueva notificación", body: "Abre el panel para ver los detalles." }
  }

  const title = payload.title || "Nueva notificación"
  const options = {
    body: payload.body || "Abre el panel para ver los detalles.",
    icon: "/movoLogo.png",
    badge: "/movoLogo.png",
    tag: payload.tag || "movo-notification",
    renotify: true,
    data: { url: payload.url || "/super-admin" },
    actions: [{ action: "open", title: "Abrir ficha" }],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || "/super-admin", self.location.origin).href

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true })
    const matchingWindow = windows.find((client) => client.url === targetUrl)
    if (matchingWindow) return matchingWindow.focus()
    const appWindow = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (appWindow) {
      const navigatedWindow = await appWindow.navigate(targetUrl)
      return (navigatedWindow || appWindow).focus()
    }
    return clients.openWindow(targetUrl)
  })())
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith("/api/")) {
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, event.clientId, event.resultingClientId))
    return
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request))
    return
  }

  // RSC, imágenes y otros GET pueden contener datos privados: no compartirlos en la caché estática.
})
