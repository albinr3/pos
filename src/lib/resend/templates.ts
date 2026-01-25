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
