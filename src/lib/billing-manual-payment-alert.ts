import { sendResendEmail } from "@/lib/resend"
import { renderManualPaymentPendingAlertEmail } from "@/lib/resend/templates"
import { logError, ErrorCodes } from "@/lib/error-logger"

type NotifyManualPaymentPendingInput = {
  accountId: string
  paymentId: string
  amountCents: number
  bankName: string
  userId?: string
  userName?: string | null
  userUsername?: string | null
  userEmail?: string | null
}

function resolveRecipientEmail() {
  return (
    process.env.BILLING_PENDING_PAYMENT_ALERT_EMAIL ||
    process.env.SUPER_ADMIN_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_FROM ||
    ""
  ).trim()
}

function formatAmountDop(amountCents: number) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
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

async function getAccountName(accountId: string) {
  const { prisma } = await import("@/lib/db")
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { name: true },
  })
  return account?.name || accountId
}

export async function notifyManualPaymentPending(
  input: NotifyManualPaymentPendingInput
) {
  const to = resolveRecipientEmail()
  if (!to) {
    console.warn("[BillingManualPaymentAlert] No recipient email configured.")
    return false
  }

  try {
    const accountName = await getAccountName(input.accountId)
    const { subject, html } = await renderManualPaymentPendingAlertEmail({
      accountName,
      amountLabel: formatAmountDop(input.amountCents),
      bankName: input.bankName,
      userName: input.userName?.trim() || "Usuario sin nombre",
      userEmail: input.userEmail?.trim() || "Sin email",
      userUsername: input.userUsername?.trim() || "sin-usuario",
      createdAtLabel: formatCreatedAt(new Date()),
      paymentId: input.paymentId,
    })

    const sent = await sendResendEmail({
      to,
      subject,
      html,
      accountId: input.accountId,
      userId: input.userId,
    })

    if (!sent) {
      console.warn("[BillingManualPaymentAlert] Failed to send notification email.")
    }

    return sent
  } catch (error) {
    await logError(error as Error, {
      code: ErrorCodes.EXTERNAL_EMAIL_ERROR,
      severity: "MEDIUM",
      accountId: input.accountId,
      userId: input.userId,
      endpoint: "/billing/manual-payment/notification",
      method: "POST",
      metadata: {
        paymentId: input.paymentId,
        bankName: input.bankName,
      },
    })
    return false
  }
}
