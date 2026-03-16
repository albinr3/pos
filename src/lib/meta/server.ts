import crypto from "crypto"

type MetaActionSource = "website"

export type MetaUserDataInput = {
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  country?: string | null
  externalId?: string | null
  clientIpAddress?: string | null
  clientUserAgent?: string | null
  fbc?: string | null
  fbp?: string | null
}

export type MetaEventInput = {
  eventName: string
  eventId: string
  eventTime?: number
  eventSourceUrl: string
  actionSource?: MetaActionSource
  userData?: MetaUserDataInput
  customData?: Record<string, unknown>
  testEventCode?: string
}

type MetaSendResult = {
  ok: boolean
  skipped?: boolean
  status?: number
  body?: unknown
  reason?: string
}

function getMetaPixelId() {
  return process.env.META_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null
}

function getMetaApiVersion() {
  return process.env.META_API_VERSION?.trim() || "v22.0"
}

function getMetaAccessToken() {
  return process.env.META_ACCESS_TOKEN?.trim() || null
}

function isMetaDebugEnabled() {
  const value = process.env.META_DEBUG?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function metaDebugLog(message: string, payload?: Record<string, unknown>) {
  if (!isMetaDebugEnabled()) return

  if (payload) {
    console.log(`[Meta][Debug] ${message}`, payload)
    return
  }

  console.log(`[Meta][Debug] ${message}`)
}

function normalizePlain(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeEmail(value?: string | null) {
  return normalizePlain(value)?.toLowerCase() ?? null
}

function normalizeName(value?: string | null) {
  const normalized = normalizePlain(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  return normalized || null
}

function normalizePhone(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? ""
  return digits || null
}

function normalizeCountry(value?: string | null) {
  const normalized = normalizePlain(value)?.toLowerCase()
  return normalized || null
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function hashIfPresent(value?: string | null, normalizer: (value?: string | null) => string | null = normalizePlain) {
  const normalized = normalizer(value)
  return normalized ? [sha256(normalized)] : undefined
}

export function splitFullName(fullName?: string | null) {
  const normalized = normalizePlain(fullName)

  if (!normalized) {
    return { firstName: null, lastName: null }
  }

  const [firstName, ...rest] = normalized.split(/\s+/)

  return {
    firstName: firstName || null,
    lastName: rest.length > 0 ? rest.join(" ") : null,
  }
}

export function getClientIpFromHeaders(headersList: Headers) {
  return (
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    null
  )
}

export async function sendMetaEvent(input: MetaEventInput): Promise<MetaSendResult> {
  const pixelId = getMetaPixelId()
  const accessToken = getMetaAccessToken()

  metaDebugLog("sendMetaEvent() invocado", {
    eventName: input.eventName,
    eventId: input.eventId,
    hasPixelId: !!pixelId,
    hasAccessToken: !!accessToken,
    hasTestEventCode: !!input.testEventCode,
    hasUserData: !!input.userData,
    customDataKeys: Object.keys(input.customData || {}),
  })

  if (!pixelId || !accessToken) {
    metaDebugLog("Evento omitido por configuración faltante", {
      missingPixelId: !pixelId,
      missingAccessToken: !accessToken,
    })
    return { ok: false, skipped: true, reason: "missing_config" }
  }

  const endpoint = `https://graph.facebook.com/${getMetaApiVersion()}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`

  const payload = {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        event_source_url: input.eventSourceUrl,
        action_source: input.actionSource ?? "website",
        user_data: {
          em: hashIfPresent(input.userData?.email, normalizeEmail),
          fn: hashIfPresent(input.userData?.firstName, normalizeName),
          ln: hashIfPresent(input.userData?.lastName, normalizeName),
          ph: hashIfPresent(input.userData?.phone, normalizePhone),
          country: hashIfPresent(input.userData?.country, normalizeCountry),
          external_id: hashIfPresent(input.userData?.externalId),
          client_ip_address: normalizePlain(input.userData?.clientIpAddress) ?? undefined,
          client_user_agent: normalizePlain(input.userData?.clientUserAgent) ?? undefined,
          fbc: normalizePlain(input.userData?.fbc) ?? undefined,
          fbp: normalizePlain(input.userData?.fbp) ?? undefined,
        },
        custom_data: input.customData,
      },
    ],
    test_event_code: input.testEventCode,
  }

  metaDebugLog("Payload listo para enviar", {
    eventName: input.eventName,
    eventSourceUrl: input.eventSourceUrl,
    hasEmail: !!normalizePlain(input.userData?.email),
    hasFirstName: !!normalizePlain(input.userData?.firstName),
    hasLastName: !!normalizePlain(input.userData?.lastName),
    hasPhone: !!normalizePlain(input.userData?.phone),
    hasCountry: !!normalizePlain(input.userData?.country),
    hasExternalId: !!normalizePlain(input.userData?.externalId),
    hasClientIp: !!normalizePlain(input.userData?.clientIpAddress),
    hasClientUserAgent: !!normalizePlain(input.userData?.clientUserAgent),
    hasFbc: !!normalizePlain(input.userData?.fbc),
    hasFbp: !!normalizePlain(input.userData?.fbp),
  })

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    metaDebugLog("Error de red al llamar Conversions API", {
      eventName: input.eventName,
      eventId: input.eventId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  let body: unknown = null

  try {
    body = await response.json()
  } catch {
    body = null
  }

  metaDebugLog("Respuesta recibida de Meta", {
    eventName: input.eventName,
    eventId: input.eventId,
    ok: response.ok,
    status: response.status,
    body,
  })

  return {
    ok: response.ok,
    status: response.status,
    body,
    reason: response.ok ? undefined : "meta_api_error",
  }
}
