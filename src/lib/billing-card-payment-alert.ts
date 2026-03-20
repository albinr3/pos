import { sendResendEmail } from "@/lib/resend"
import { renderCardPaymentEventAlertEmail } from "@/lib/resend/templates"
import { logError, ErrorCodes } from "@/lib/error-logger"

type NotifyCardPaymentEventInput = {
  accountId: string
  paymentId: string
  accountName: string
  amountCents: number
  eventType: "success" | "failed"
}

function resolveRecipientEmail() {
  return (
    process.env.BILLING_CARD_PAYMENT_ALERT_EMAIL ||
    process.env.BILLING_PENDING_PAYMENT_ALERT_EMAIL ||
    process.env.SUPER_ADMIN_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_FROM ||
    ""
  ).trim()
}

function formatAmountUsd(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100)
}

function formatCreatedAt(date: Date) {
  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santo_Domingo",
  }).format(date)
}

export async function notifyCardPaymentEventEmail(
  input: NotifyCardPaymentEventInput
) {
  const to = resolveRecipientEmail()
  if (!to) {
    console.warn("[BillingCardPaymentAlert] No recipient email configured.")
    return false
  }

  try {
    const { subject, html } = await renderCardPaymentEventAlertEmail({
      accountName: input.accountName,
      amountLabel: formatAmountUsd(input.amountCents),
      statusLabel: input.eventType === "success" ? "Exitoso" : "Fallido",
      createdAtLabel: formatCreatedAt(new Date()),
      paymentId: input.paymentId,
      eventType: input.eventType,
    })

    const sent = await sendResendEmail({
      to,
      subject,
      html,
      accountId: input.accountId,
    })

    if (!sent) {
      console.warn("[BillingCardPaymentAlert] Failed to send notification email.")
    }

    return sent
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.EXTERNAL_EMAIL_ERROR,
      severity: "MEDIUM",
      accountId: input.accountId,
      endpoint: "/billing/card-payment/notification",
      method: "POST",
      metadata: {
        paymentId: input.paymentId,
        eventType: input.eventType,
      },
    })
    return false
  }
}
