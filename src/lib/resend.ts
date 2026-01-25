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

export async function sendResendEmail({ to, subject, html, from, accountId, userId }: SendResendEmailOptions): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not configured, skipping email to", to)
    return false
  }

  const emailFrom = from || process.env.EMAIL_FROM || "facturacion@movopos.com"

  try {
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

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Resend email failed:", errorText)
      await logError(new Error(`Resend API error: ${errorText}`), {
        code: ErrorCodes.EXTERNAL_EMAIL_ERROR,
        severity: "MEDIUM",
        accountId,
        userId,
        endpoint: "resend.com/emails",
        method: "POST",
        metadata: { to, subject, statusCode: response.status },
      })
      return false
    }

    return true
  } catch (error) {
    console.error("Error sending email via Resend:", error)
    await logError(error as Error, {
      code: ErrorCodes.EXTERNAL_EMAIL_ERROR,
      severity: "MEDIUM",
      accountId,
      userId,
      endpoint: "resend.com/emails",
      method: "POST",
      metadata: { to, subject },
    })
    return false
  }
}
