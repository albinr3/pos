import { logError, ErrorCodes } from "@/lib/error-logger"

type SendResendEmailOptions = {
  to: string
  subject: string
  html: string
  from?: string
  /** ID de la cuenta (para logging) */
  accountId?: string
  /** ID del usuario (para logging) */
  userId?: string
}

const MIN_SEND_INTERVAL_MS = 500
const MAX_SEND_INTERVAL_MS = 700
const MAX_429_RETRIES = 3
const FALLBACK_RETRY_MIN_MS = 900
const FALLBACK_RETRY_MAX_MS = 1300

let nextAllowedSendAt = 0

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForThrottle() {
  const now = Date.now()
  if (now < nextAllowedSendAt) {
    await sleep(nextAllowedSendAt - now)
  }
  nextAllowedSendAt = Date.now() + randomBetween(MIN_SEND_INTERVAL_MS, MAX_SEND_INTERVAL_MS)
}

function getRetryDelayMs(response: Response): number {
  const retryAfter = response.headers.get("retry-after")
  if (retryAfter) {
    const numericSeconds = Number(retryAfter)
    if (!Number.isNaN(numericSeconds) && numericSeconds > 0) {
      return Math.ceil(numericSeconds * 1000)
    }

    const retryDateMs = Date.parse(retryAfter)
    if (!Number.isNaN(retryDateMs)) {
      return Math.max(0, retryDateMs - Date.now())
    }
  }

  return randomBetween(FALLBACK_RETRY_MIN_MS, FALLBACK_RETRY_MAX_MS)
}

export async function sendResendEmail({ to, subject, html, from, accountId, userId }: SendResendEmailOptions): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not configured, skipping email to", to)
    return false
  }

  const emailFrom = from || process.env.EMAIL_FROM || "facturacion@movopos.com"

  const maxAttempts = MAX_429_RETRIES + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await waitForThrottle()

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to,
          subject,
          html,
        }),
      })

      if (response.ok) {
        return true
      }

      const errorText = await response.text()

      if (response.status === 429 && attempt < maxAttempts) {
        const retryDelayMs = getRetryDelayMs(response)
        console.warn(
          `Resend rate limit (429). Retrying ${attempt}/${MAX_429_RETRIES} in ${retryDelayMs}ms for ${to}.`
        )
        await sleep(retryDelayMs)
        continue
      }

      console.error("Resend email failed:", errorText)
      await logError(new Error(`Resend API error: ${errorText}`), {
        code: ErrorCodes.EXTERNAL_EMAIL_ERROR,
        severity: "MEDIUM",
        accountId,
        userId,
        endpoint: "resend.com/emails",
        method: "POST",
        metadata: { to, subject, statusCode: response.status, attempt, maxAttempts },
      })
      return false
    } catch (error) {
      console.error("Error sending email via Resend:", error)
      await logError(error as Error, {
        code: ErrorCodes.EXTERNAL_EMAIL_ERROR,
        severity: "MEDIUM",
        accountId,
        userId,
        endpoint: "resend.com/emails",
        method: "POST",
        metadata: { to, subject, attempt, maxAttempts },
      })
      return false
    }
  }

  return false
}
