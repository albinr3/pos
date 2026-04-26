"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db"
import { sendResendEmail } from "@/lib/resend"
import { sanitizeEmail } from "@/lib/sanitize"
import { getCurrentSuperAdmin, logSuperAdminAction } from "@/lib/super-admin-auth"

type BillingStatus = "TRIALING" | "ACTIVE" | "GRACE" | "BLOCKED" | "CANCELED"

export type MarketingAccountItem = {
  id: string
  name: string
  ownerEmail: string | null
  ownerName: string | null
  status: BillingStatus
  createdAt: Date
}

type SendMassMarketingEmailInput = {
  accountIds: string[]
  subject: string
  message: string
}

type SendMassMarketingEmailResult = {
  success: boolean
  error?: string
  sentCount?: number
  failedCount?: number
  totalRecipients?: number
}

function canAccessEmailMarketing(admin: Awaited<ReturnType<typeof getCurrentSuperAdmin>>) {
  if (!admin) return false
  if (admin.role === "OWNER" || admin.role === "ADMIN") return true
  return admin.canSendEmails
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildMarketingEmailHtml(accountName: string, message: string): string {
  const messageHtml = escapeHtml(message).replace(/\r?\n/g, "<br />")
  const safeAccountName = escapeHtml(accountName)
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "hola@movopos.com"
  const safeSupportEmail = escapeHtml(supportEmail)

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 16px;">MOVOPos</h2>
      <p style="margin: 0 0 12px;">Hola, equipo de <strong>${safeAccountName}</strong>.</p>
      <p style="margin: 0 0 16px;">${messageHtml}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="font-size: 12px; color: #6b7280; margin: 0;">
        Si necesitas ayuda, puedes responder a este correo o escribir a ${safeSupportEmail}.
      </p>
    </div>
  `
}

export async function getEmailMarketingAccounts(): Promise<MarketingAccountItem[]> {
  const admin = await getCurrentSuperAdmin()
  if (!canAccessEmailMarketing(admin)) {
    throw new Error("No autorizado")
  }

  const accounts = await prisma.account.findMany({
    include: {
      billingSubscription: {
        select: {
          status: true,
        },
      },
      billingProfile: {
        select: {
          email: true,
        },
      },
      users: {
        where: { isOwner: true },
        take: 1,
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return accounts.map((account) => {
    const owner = account.users[0]
    const ownerEmail = sanitizeEmail(account.billingProfile?.email || owner?.email || "") || null
    return {
      id: account.id,
      name: account.name,
      ownerEmail,
      ownerName: owner?.name || null,
      status: (account.billingSubscription?.status || "BLOCKED") as BillingStatus,
      createdAt: account.createdAt,
    }
  })
}

export async function sendMassMarketingEmail(
  input: SendMassMarketingEmailInput
): Promise<SendMassMarketingEmailResult> {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    return { success: false, error: "Sesion expirada. Inicia sesion nuevamente en super-admin." }
  }

  if (!canAccessEmailMarketing(admin)) {
    return { success: false, error: "Tu usuario no tiene permiso canSendEmails para enviar correos masivos." }
  }

  const subject = input.subject.trim()
  const message = input.message.trim()
  const normalizedAccountIds = Array.from(new Set(input.accountIds.map((id) => id.trim()).filter(Boolean)))

  if (!normalizedAccountIds.length) {
    return { success: false, error: "Selecciona al menos una cuenta" }
  }
  if (!subject) {
    return { success: false, error: "El asunto es obligatorio" }
  }
  if (subject.length > 180) {
    return { success: false, error: "El asunto no puede superar 180 caracteres" }
  }
  if (!message) {
    return { success: false, error: "El contenido del correo es obligatorio" }
  }
  if (message.length > 12000) {
    return { success: false, error: "El contenido no puede superar 12000 caracteres" }
  }

  const accounts = await prisma.account.findMany({
    where: {
      id: { in: normalizedAccountIds },
    },
    include: {
      billingProfile: {
        select: { email: true },
      },
      users: {
        where: { isOwner: true },
        take: 1,
        select: {
          email: true,
          name: true,
        },
      },
    },
  })

  if (!accounts.length) {
    return { success: false, error: "No se encontraron cuentas validas para enviar" }
  }

  const recipientsByEmail = new Map<
    string,
    { email: string; accountId: string; accountName: string }
  >()

  for (const account of accounts) {
    const owner = account.users[0]
    const normalizedEmail = sanitizeEmail(account.billingProfile?.email || owner?.email || "")
    if (!normalizedEmail) continue
    if (!recipientsByEmail.has(normalizedEmail)) {
      recipientsByEmail.set(normalizedEmail, {
        email: normalizedEmail,
        accountId: account.id,
        accountName: account.name,
      })
    }
  }

  const recipients = Array.from(recipientsByEmail.values())
  if (!recipients.length) {
    return { success: false, error: "Las cuentas seleccionadas no tienen correos validos" }
  }

  let sentCount = 0
  let failedCount = 0
  const failedRecipients: string[] = []

  for (const recipient of recipients) {
    const html = buildMarketingEmailHtml(recipient.accountName, message)
    const ok = await sendResendEmail({
      to: recipient.email,
      subject,
      html,
      accountId: recipient.accountId,
      userId: admin.id,
    })

    if (ok) {
      sentCount += 1
      continue
    }

    failedCount += 1
    failedRecipients.push(recipient.email)
  }

  await logSuperAdminAction(admin.id, "sent_marketing_email_bulk", {
    metadata: {
      selectedAccounts: normalizedAccountIds.length,
      matchedAccounts: accounts.length,
      totalRecipients: recipients.length,
      sentCount,
      failedCount,
      failedRecipientsPreview: failedRecipients.slice(0, 20),
      subject,
    },
  })

  revalidatePath("/super-admin/email-marketing")

  if (sentCount === 0) {
    return {
      success: false,
      error: "No se pudo enviar ningun correo. Revisa la configuracion de Resend.",
      sentCount,
      failedCount,
      totalRecipients: recipients.length,
    }
  }

  return {
    success: true,
    sentCount,
    failedCount,
    totalRecipients: recipients.length,
  }
}
