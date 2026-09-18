const CACHE_VERSION = "v4"
const STATIC_CACHE = `pos-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `pos-runtime-${CACHE_VERSION}`
const OFFLINE_URL = "/offline.html"

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
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
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

async function networkFirst(request, { fallbackOffline } = {}) {
  const cache = await caches.open(RUNTIME_CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached

    if (fallbackOffline) {
      const staticCache = await caches.open(STATIC_CACHE)
      const offline = await staticCache.match(OFFLINE_URL)
      if (offline) return offline
    }

    return Response.error()
  }
}

async function warmNavigationCache(rawUrl) {
  if (!rawUrl) return

  const targetUrl = new URL(rawUrl, self.location.origin)
  if (targetUrl.origin !== self.location.origin) return
  if (targetUrl.pathname.startsWith("/api/") || targetUrl.pathname.startsWith("/_next/")) return

  // Pre-fetch and cache navigations triggered by Next client routing (no SW fetch event).
  const cache = await caches.open(RUNTIME_CACHE)
  const request = new Request(targetUrl.toString(), {
    method: "GET",
    credentials: "include",
  })
  const cached = await cache.match(request)
  if (cached) return

  try {
    const response = await fetch(request)
    if (response && response.ok) {
      await cache.put(request, response.clone())
    }
  } catch {
    // Ignore warmup errors
  }
}

self.addEventListener("message", (event) => {
  const data = event.data
  if (!data || data.type !== "CACHE_URL") return
  // Keep the cache warm for offline fallbacks without needing a hard reload.
  event.waitUntil(warmNavigationCache(data.url))
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
    event.respondWith(networkFirst(request, { fallbackOffline: true }))
    return
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (request.destination === "image" || request.destination === "font") {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(staleWhileRevalidate(request))
})
