import { readFile } from "fs/promises"
import path from "path"

const templateCache = new Map<string, string>()
const templatesDir = path.join(process.cwd(), "templates", "resend")

async function loadTemplate(templateName: string) {
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName)!
  }

  const templatePath = path.join(templatesDir, templateName)
  const content = await readFile(templatePath, "utf-8")
  templateCache.set(templateName, content)
  return content
}

function escapeHtml(value: string) {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }
  return value.replace(/[&<>"']/g, (char) => map[char] ?? char)
}

async function renderTemplate(
  templateName: string,
  variables: Record<string, string>
) {
  const template = await loadTemplate(templateName)
  return template.replace(/{{\s*([\w-]+)\s*}}/g, (_, key) => {
    const value = variables[key]
    return value !== undefined ? escapeHtml(value) : ""
  })
}

type WelcomeNewUserTemplateData = {
  name: string
  username: string
  temporaryPassword: string
}

export async function renderWelcomeNewUserEmail(
  data: WelcomeNewUserTemplateData
) {
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"
  const appUrl = rawAppUrl.replace(/\/+$/, "")
  const loginUrl = `${appUrl}/login`
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "MOVOPos"
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "hola@movopos.com"

  const html = await renderTemplate("welcome-new-user.html", {
    brandName,
    userName: data.name,
    userHandle: data.username,
    temporaryPassword: data.temporaryPassword,
    loginUrl,
    appUrl,
    supportEmail,
  })

  const subject = `¡Bienvenido a ${brandName}!`
  return { subject, html }
}

type SubUserTemporaryCodeTemplateData = {
  name: string
  username: string
  code: string
}

export async function renderSubUserTemporaryCodeEmail(
  data: SubUserTemporaryCodeTemplateData
) {
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"
  const appUrl = rawAppUrl.replace(/\/+$/, "")
  const loginUrl = `${appUrl}/select-user`
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "MOVOPos"
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "hola@movopos.com"

  const html = await renderTemplate("subuser-temp-code.html", {
    brandName,
    userName: data.name,
    username: data.username,
    code: data.code,
    loginUrl,
    appUrl,
    supportEmail,
  })

  const subject = `Código temporal para ${brandName}`
  return { subject, html }
}

type WelcomeOwnerTemplateData = {
  name: string
}

export async function renderWelcomeOwnerEmail(data: WelcomeOwnerTemplateData) {
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"
  const appUrl = rawAppUrl.replace(/\/+$/, "")
  const loginUrl = `${appUrl}/login`
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "MOVOPos"
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "hola@movopos.com"

  const html = await renderTemplate("welcome-owner.html", {
    brandName,
    userName: data.name,
    loginUrl,
    appUrl,
    supportEmail,
  })

  const subject = `¡Bienvenido a ${brandName}!`
  return { subject, html }
}

// ==========================================
// BILLING EMAIL TEMPLATES
// ==========================================

type TrialExpiringTemplateData = {
  accountName: string
  daysRemaining: number
}

export async function renderTrialExpiringEmail(
  data: TrialExpiringTemplateData
) {
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"
  const appUrl = rawAppUrl.replace(/\/+$/, "")
  const billingUrl = `${appUrl}/billing`
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "MOVOPos"
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "hola@movopos.com"

  const message =
    data.daysRemaining === 0
      ? `Tu período de prueba de ${brandName} termina hoy.`
      : `Te quedan <span class="highlight">${data.daysRemaining} días</span> de período de prueba en ${brandName}.`

  const html = await renderTemplate("trial-expiring.html", {
    brandName,
    accountName: data.accountName,
    message,
    billingUrl,
    appUrl,
    supportEmail,
    year: new Date().getFullYear().toString(),
  })

  const subject =
    data.daysRemaining === 0
      ? "Tu período de prueba termina hoy"
      : `Te quedan ${data.daysRemaining} días de prueba`

  return { subject, html }
}

type SubscriptionDueTemplateData = {
  accountName: string
  daysRemaining: number
}

export async function renderSubscriptionDueEmail(
  data: SubscriptionDueTemplateData
) {
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"
  const appUrl = rawAppUrl.replace(/\/+$/, "")
  const billingUrl = `${appUrl}/billing`
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "MOVOPos"
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "hola@movopos.com"

  const message =
    data.daysRemaining === 0
      ? `Tu suscripción de ${brandName} vence hoy.`
      : `Tu suscripción de ${brandName} vence en ${data.daysRemaining} días.`

  const html = await renderTemplate("subscription-due.html", {
    brandName,
    accountName: data.accountName,
    message,
    billingUrl,
    appUrl,
    supportEmail,
    year: new Date().getFullYear().toString(),
  })

  const subject =
    data.daysRemaining === 0
      ? "Tu suscripción vence hoy"
      : `Tu suscripción vence en ${data.daysRemaining} días`

  return { subject, html }
}

type GracePeriodTemplateData = {
  accountName: string
  daysRemaining: number
}

export async function renderGracePeriodEmail(data: GracePeriodTemplateData) {
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"
  const appUrl = rawAppUrl.replace(/\/+$/, "")
  const billingUrl = `${appUrl}/billing`
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "MOVOPos"
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "hola@movopos.com"

  const message =
    data.daysRemaining === 0
      ? "Tu cuenta será bloqueada hoy si no realizas el pago."
      : `Tu cuenta será bloqueada en ${data.daysRemaining} días si no realizas el pago.`

  const html = await renderTemplate("grace-period.html", {
    brandName,
    accountName: data.accountName,
    message,
    billingUrl,
    appUrl,
    supportEmail,
    year: new Date().getFullYear().toString(),
  })

  const subject =
    data.daysRemaining === 0
      ? "⚠️ Tu cuenta será bloqueada hoy"
      : `⚠️ Tu cuenta será bloqueada en ${data.daysRemaining} días`

  return { subject, html }
}

type AccountBlockedTemplateData = {
  accountName: string
}

export async function renderAccountBlockedEmail(
  data: AccountBlockedTemplateData
) {
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com"
  const appUrl = rawAppUrl.replace(/\/+$/, "")
  const billingUrl = `${appUrl}/billing`
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "MOVOPos"
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "hola@movopos.com"

  const html = await renderTemplate("account-blocked.html", {
    brandName,
    accountName: data.accountName,
    billingUrl,
    appUrl,
    supportEmail,
    year: new Date().getFullYear().toString(),
  })

  const subject = "🔒 Tu cuenta ha sido bloqueada"

  return { subject, html }
}
