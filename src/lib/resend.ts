type SendResendEmailOptions = {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendResendEmail({ to, subject, html, from }: SendResendEmailOptions): Promise<boolean> {
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
      const error = await response.text()
      console.error("Resend email failed:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("Error sending email via Resend:", error)
    return false
  }
}
