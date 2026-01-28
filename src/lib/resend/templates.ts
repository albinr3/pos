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

  // Primero reemplazar variables sin escapar {{{ variable }}}
  let rendered = template.replace(/{{{\s*([\w-]+)\s*}}}/g, (_, key) => {
    const value = variables[key]
    return value !== undefined ? value : ""
  })

  // Luego reemplazar variables escapadas {{ variable }}
  rendered = rendered.replace(/{{\s*([\w-]+)\s*}}/g, (_, key) => {
    const value = variables[key]
    return value !== undefined ? escapeHtml(value) : ""
  })

  return rendered
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

type NewUserSignupNotificationData = {
  accountName: string
  userEmail: string
  clerkUserId: string
  registrationDate: string
}

export async function renderNewUserSignupNotification(
  data: NewUserSignupNotificationData
) {
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "MOVOPos"

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuevo Usuario Registrado</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
          🎉 Nuevo Usuario Registrado
        </h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <p style="margin: 0 0 20px; color: #18181b; font-size: 16px; line-height: 24px;">
          Se ha registrado un nuevo usuario en <strong>${escapeHtml(brandName)}</strong>:
        </p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 12px; background-color: #f4f4f5; border: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">
              Nombre de la cuenta:
            </td>
            <td style="padding: 12px; background-color: #ffffff; border: 1px solid #e4e4e7; color: #18181b;">
              ${escapeHtml(data.accountName)}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px; background-color: #f4f4f5; border: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">
              Email:
            </td>
            <td style="padding: 12px; background-color: #ffffff; border: 1px solid #e4e4e7; color: #18181b;">
              ${escapeHtml(data.userEmail)}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px; background-color: #f4f4f5; border: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">
              Clerk User ID:
            </td>
            <td style="padding: 12px; background-color: #ffffff; border: 1px solid #e4e4e7; color: #18181b; font-family: monospace; font-size: 14px;">
              ${escapeHtml(data.clerkUserId)}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px; background-color: #f4f4f5; border: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">
              Fecha de registro:
            </td>
            <td style="padding: 12px; background-color: #ffffff; border: 1px solid #e4e4e7; color: #18181b;">
              ${escapeHtml(data.registrationDate)}
            </td>
          </tr>
        </table>

        <p style="margin: 20px 0 0; color: #71717a; font-size: 14px; line-height: 20px;">
          Esta es una notificación automática del sistema ${escapeHtml(brandName)}.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px; text-align: center; border-top: 1px solid #e4e4e7; background-color: #fafafa;">
        <p style="margin: 0; color: #71717a; font-size: 12px;">
          © ${new Date().getFullYear()} ${escapeHtml(brandName)}. Todos los derechos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const subject = `🎉 Nuevo usuario registrado: ${data.accountName}`

  return { subject, html }
}

type ErrorNotificationTemplateData = {
  error: Error
  code?: string
  severity: string
  accountId?: string
  userId?: string
  endpoint?: string
  method?: string
  metadata?: Record<string, unknown>
}

export async function renderErrorNotification(data: ErrorNotificationTemplateData) {
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "MOVOPos"

  const metadataHtml = data.metadata
    ? `<pre style="background-color: #f4f4f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${escapeHtml(JSON.stringify(data.metadata, null, 2))}</pre>`
    : "N/A"

  const html = await renderTemplate("error-notification.html", {
    brandName,
    errorMessage: data.error.message,
    errorCode: data.code || "N/A",
    severity: data.severity,
    severityBgColor: data.severity === 'CRITICAL' ? '#fee2e2' : '#f3f4f6',
    severityTextColor: data.severity === 'CRITICAL' ? '#991b1b' : '#374151',
    endpoint: data.endpoint || "N/A",
    method: data.method || "N/A",
    accountId: data.accountId || "N/A",
    userId: data.userId || "N/A",
    stackTrace: data.error.stack || "No stack trace available",
    metadataHtml, // Usamos {{{ metadataHtml }}} en el template para que no se escape
    year: new Date().getFullYear().toString(),
  })

  const subject = `🚨 [${data.severity}] Error en ${brandName}: ${data.code || "UNKNOWN"}`

  return { subject, html }
}
