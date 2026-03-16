"use client"

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: (...args: unknown[]) => void
  }
}

export type MetaBrowserUserData = {
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  externalId?: string | null
  country?: string | null
}

type MetaViewContentInput = {
  pathname: string
  isAuthenticated: boolean
}

export function getMetaPixelId() {
  return process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null
}

export function createMetaEventId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getMetaCookie(name: "_fbp" | "_fbc") {
  if (typeof document === "undefined") return null

  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function normalizeAdvancedMatchingValue(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizePhoneForAdvancedMatching(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? ""
  return digits || undefined
}

export function initMetaPixel(pixelId: string, userData?: MetaBrowserUserData) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return false
  }

  const advancedMatching = {
    em: normalizeAdvancedMatchingValue(userData?.email)?.toLowerCase(),
    fn: normalizeAdvancedMatchingValue(userData?.firstName)?.toLowerCase(),
    ln: normalizeAdvancedMatchingValue(userData?.lastName)?.toLowerCase(),
    ph: normalizePhoneForAdvancedMatching(userData?.phone),
    external_id: normalizeAdvancedMatchingValue(userData?.externalId),
    country: normalizeAdvancedMatchingValue(userData?.country)?.toLowerCase(),
  }

  const hasAdvancedMatching = Object.values(advancedMatching).some(Boolean)

  if (hasAdvancedMatching) {
    window.fbq("init", pixelId, advancedMatching)
  } else {
    window.fbq("init", pixelId)
  }

  window.fbq("track", "PageView")
  return true
}

export function trackMetaEvent(
  eventName: string,
  parameters?: Record<string, unknown>,
  eventId?: string
) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return false
  }

  if (eventId) {
    window.fbq("track", eventName, parameters ?? {}, { eventID: eventId })
  } else {
    window.fbq("track", eventName, parameters ?? {})
  }

  return true
}

export function shouldTrackViewContent(pathname: string) {
  return ["/", "/pricing", "/login", "/billing"].includes(pathname)
}

export function buildViewContentPayload({
  pathname,
  isAuthenticated,
}: MetaViewContentInput) {
  const authLabel = isAuthenticated ? "Autenticado" : "Anónimo"

  switch (pathname) {
    case "/":
      return {
        content_name: `Landing MOVOPos - ${authLabel}`,
        content_category: "marketing",
        content_type: "product",
      }
    case "/pricing":
      return {
        content_name: `Precios MOVOPos - ${authLabel}`,
        content_category: "pricing",
        content_type: "product",
        currency: "DOP",
        value: 1300,
      }
    case "/login":
      return {
        content_name: `Acceso MOVOPos - ${authLabel}`,
        content_category: "authentication",
        content_type: "product",
      }
    case "/billing":
      return {
        content_name: `Facturación MOVOPos - ${authLabel}`,
        content_category: "billing",
        content_type: "product",
      }
    default:
      return {
        content_name: `Contenido MOVOPos - ${authLabel}`,
        content_category: "content",
        content_type: "product",
      }
  }
}
