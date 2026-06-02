type KapsoTemplatePayload = {
  to: string
  templateName: string
  languageCode: string
}

export type KapsoSendTemplateResult = {
  success: boolean
  error?: string
  providerMessageId?: string
}

type KapsoErrorResponse = {
  error?: {
    message?: string
  }
}

const DEFAULT_KAPSO_BASE_URL = "https://api.kapso.ai"
const DEFAULT_KAPSO_VERSION = "v24.0"

function normalizeKapsoBaseUrl(baseUrl?: string) {
  return (baseUrl || DEFAULT_KAPSO_BASE_URL).replace(/\/+$/, "")
}

function parseKapsoErrorMessage(rawBody: string): string | null {
  if (!rawBody) return null
  try {
    const parsed = JSON.parse(rawBody) as KapsoErrorResponse
    return parsed.error?.message?.trim() || null
  } catch {
    return null
  }
}

export function normalizeInternationalPhone(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[^\d+]/g, "")
  if (!/^\+?\d{8,15}$/.test(cleaned)) return null
  return cleaned.replace(/^\+/, "")
}

export async function sendKapsoTemplateMessage({
  to,
  templateName,
  languageCode,
}: KapsoTemplatePayload): Promise<KapsoSendTemplateResult> {
  const apiKey = process.env.KAPSO_API_KEY?.trim()
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID?.trim()
  const baseUrl = normalizeKapsoBaseUrl(process.env.KAPSO_API_BASE_URL)

  if (!apiKey || !phoneNumberId) {
    return {
      success: false,
      error: "Faltan credenciales KAPSO_API_KEY o KAPSO_PHONE_NUMBER_ID en el entorno.",
    }
  }

  const endpoint = `${baseUrl}/meta/whatsapp/${DEFAULT_KAPSO_VERSION}/${phoneNumberId}/messages`

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      }),
    })

    const rawBody = await response.text()
    let providerMessageId: string | undefined

    try {
      const json = JSON.parse(rawBody) as { messages?: Array<{ id?: string }> }
      providerMessageId = json.messages?.[0]?.id
    } catch {
      providerMessageId = undefined
    }

    if (!response.ok) {
      const providerError = parseKapsoErrorMessage(rawBody)
      return {
        success: false,
        error: providerError || `Kapso respondió ${response.status} ${response.statusText}.`,
      }
    }

    return { success: true, providerMessageId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error de red al enviar a Kapso.",
    }
  }
}
