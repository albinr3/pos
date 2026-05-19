"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { currentUser } from "@clerk/nextjs/server"
import {
  getOrCreateAccount,
  listSubUsers,
  authenticateSubUser as authenticateSubUserBase,
  createSubUserSession,
  setSubUserSessionCookie,
  clearSubUserSession,
  isClerkAuthenticated,
} from "@/lib/auth"
import { createBillingSubscription } from "@/lib/billing"
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit"
import { logAuditEvent } from "@/lib/audit-log"
import { getClientIpFromHeaders, sendMetaEvent } from "@/lib/meta/server"
import { sendResendEmail } from "@/lib/resend"
import { renderSubUserTemporaryCodeEmail } from "@/lib/resend/templates"
import { randomInt } from "crypto"

function isMetaDebugEnabled() {
  const value = process.env.META_DEBUG?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function metaDebugLog(message: string, payload?: Record<string, unknown>) {
  if (!isMetaDebugEnabled()) return

  if (payload) {
    console.log(`[Meta][Debug] ${message}`, payload)
    return
  }

  console.log(`[Meta][Debug] ${message}`)
}

async function authenticateSubUser(
  accountId: string,
  username: string,
  password: string
) {
  // 🔐 RATE LIMITING - Máximo 5 intentos cada 15 minutos
  try {
    const identifier = `login:${accountId}:${username}`
    checkRateLimit(identifier, {
      windowMs: 15 * 60 * 1000, // 15 minutos
      maxRequests: 5,
      blockDurationMs: 15 * 60 * 1000 // Bloquear 15 minutos después de exceder
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { 
        success: false, 
        error: `Demasiados intentos fallidos. Intenta de nuevo en ${error.retryAfter} segundos.` 
      }
    }
  }

  return authenticateSubUserBase(accountId, username, password)
}

export async function getAccountAndUsers() {
  // Verificar autenticación de Clerk
  const isAuthenticated = await isClerkAuthenticated()
  if (!isAuthenticated) {
    return { error: "not_authenticated" as const }
  }

  // Obtener o crear Account
  const account = await getOrCreateAccount()
  if (!account) {
    return { error: "account_error" as const }
  }

  // Listar usuarios del account
  const users = await listSubUsers(account.id)

  return {
    account: {
      id: account.id,
      name: account.name,
    },
    users,
  }
}

/**
 * Limpia la sesión de subusuario (Server Action)
 * Se usa cuando hay inconsistencias entre la sesión de Clerk y la de subusuario
 */
export async function clearInvalidSubUserSession() {
  await clearSubUserSession()
}

export async function loginSubUser(formData: FormData) {
  const accountId = formData.get("accountId") as string
  const username = formData.get("username") as string
  const password = formData.get("password") as string

  if (!accountId || !username || !password) {
    return { error: "Todos los campos son requeridos" }
  }

  // Verificar autenticación de Clerk
  const isAuthenticated = await isClerkAuthenticated()
  if (!isAuthenticated) {
    return { error: "Sesión de cuenta principal expirada. Por favor, inicia sesión de nuevo." }
  }

  // Autenticar subusuario
  const result = await authenticateSubUser(accountId, username, password)

  if (!result.success || !result.user) {
    return { error: result.error || "Error de autenticación" }
  }

  // Crear sesión
  const token = await createSubUserSession(accountId, result.user.id)
  await setSubUserSessionCookie(token)

  // Redirigir al dashboard
  redirect("/dashboard")
}

export async function createFirstUser(formData: FormData) {
  const accountId = formData.get("accountId") as string
  const password = formData.get("password") as string
  const businessName = formData.get("businessName") as string
  const whatsappPhone = formData.get("whatsappPhone") as string
  const username = formData.get("username") as string
  const logoUrlRaw = (formData.get("logoUrl") as string) || ""
  const logoUrl = logoUrlRaw.trim() || null

  if (!accountId || !password || !businessName || !whatsappPhone || !username) {
    return { error: "Todos los campos son requeridos" }
  }

  // Validar que la contraseña sea exactamente 4 dígitos
  if (!/^\d{4}$/.test(password)) {
    return { error: "La contraseña debe ser exactamente 4 dígitos" }
  }

  // Verificar autenticación de Clerk
  const isAuthenticated = await isClerkAuthenticated()
  if (!isAuthenticated) {
    return { error: "Sesión de cuenta principal expirada. Por favor, inicia sesión de nuevo." }
  }

  // Obtener datos del usuario de Clerk
  const clerkUser = await currentUser()
  if (!clerkUser) {
    return { error: "No se pudo obtener la información del usuario" }
  }

  // Verificar que no existan usuarios
  const users = await listSubUsers(accountId)
  metaDebugLog("createFirstUser: resultado de listSubUsers", {
    accountId,
    usersCount: users.length,
  })
  if (users.length > 0) {
    metaDebugLog("createFirstUser abortado: ya existen usuarios", {
      accountId,
    })
    return { error: "Ya existen usuarios en esta cuenta" }
  }

  const { prisma } = await import("@/lib/db")
  const bcrypt = await import("bcryptjs")

  const trimmedBusinessName = businessName.trim()
  if (!trimmedBusinessName) {
    return { error: "El nombre del negocio es requerido" }
  }

  const trimmedWhatsappPhone = whatsappPhone.trim()
  if (!trimmedWhatsappPhone) {
    return { error: "El número con WhatsApp es requerido" }
  }

  const trimmedUsername = username.trim().toLowerCase().replace(/\s/g, "")
  if (!trimmedUsername) {
    return { error: "El usuario es requerido" }
  }

  const displayName = username.trim() || "Administrador"
  const email = clerkUser.emailAddresses?.[0]?.emailAddress || null

  // Crear el primer usuario directamente como owner
  const passwordHash = await bcrypt.hash(password, 10)

  // Verificar que el username no exista (por si acaso)
  const existing = await prisma.user.findUnique({
    where: {
      accountId_username: {
        accountId,
        username: trimmedUsername,
      },
    },
  })

  if (existing) {
    return { error: "El nombre de usuario ya existe" }
  }

  await prisma.account.update({
    where: { id: accountId },
    data: { name: trimmedBusinessName },
  })

  await prisma.companySettings.upsert({
    where: { accountId },
    update: {
      name: trimmedBusinessName,
      phone: trimmedWhatsappPhone,
      ...(logoUrl !== null && { logoUrl }),
    },
    create: {
      accountId,
      name: trimmedBusinessName,
      phone: trimmedWhatsappPhone,
      address: "",
      logoUrl,
      allowNegativeStock: false,
      itbisRateBp: 1800,
      salePricesIncludeItbis: true,
      legalTipEnabled: false,
    },
  })

  // Crear usuario como owner
  const createdUser = await prisma.user.create({
    data: {
      accountId,
      name: displayName,
      username: trimmedUsername,
      passwordHash,
      email: email,
      role: "ADMIN",
      isOwner: true,
      canOverridePrice: true,
      canCancelSales: true,
      canCancelReturns: true,
      canCancelPayments: true,
      canEditSales: true,
      canEditProducts: true,
      canChangeSaleType: true,
      canSellWithoutStock: true,
      canManageBackups: true,
      canViewProductCosts: true,
      canViewProfitReport: true,
      canAdjustInventory: true,
      canManageCategories: true,
      canManagePurchases: true,
      canCancelPurchases: true,
      canManageSuppliers: true,
      canManageCustomers: true,
      canApproveCredit: true,
      canManageExpenses: true,
      canCancelExpenses: true,
      canManageQuotes: true,
      canApplyDiscounts: true,
      canViewAuditLogs: true,
      canManageUsers: true,
      canManageSettings: true,
      canViewTreasury: true,
      canManageTreasuryAccounts: true,
      canCreateTreasuryTransfers: true,
      canReverseTreasuryTransfers: true,
    },
  })

  // Crear suscripción de billing si es la primera cuenta owner
  try {
    const existingSubscription = await prisma.billingSubscription.findUnique({
      where: { accountId },
    })
    metaDebugLog("createFirstUser: verificación de suscripción", {
      accountId,
      hasExistingSubscription: !!existingSubscription,
      existingSubscriptionId: existingSubscription?.id ?? null,
      existingSubscriptionStatus: existingSubscription?.status ?? null,
    })

    if (!existingSubscription) {
      const subscription = await createBillingSubscription({ accountId })
      const headersList = await headers()
      const cookieStore = await cookies()
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.movopos.com").replace(/\/$/, "")
      const fbc = cookieStore.get("_fbc")?.value ?? null
      const fbp = cookieStore.get("_fbp")?.value ?? null
      const clientIpAddress = getClientIpFromHeaders(headersList)
      const clientUserAgent = headersList.get("user-agent")
      const metaTestEventCode = process.env.META_TEST_EVENT_CODE?.trim() || undefined

      metaDebugLog("createFirstUser: StartTrial listo para enviar", {
        accountId,
        subscriptionId: subscription.id,
        eventId: `trial-${subscription.id}`,
        eventSourceUrl: `${appUrl}/select-user`,
        hasEmail: !!email,
        hasPhone: !!trimmedWhatsappPhone,
        hasClientIpAddress: !!clientIpAddress,
        hasClientUserAgent: !!clientUserAgent,
        hasFbc: !!fbc,
        hasFbp: !!fbp,
        hasMetaTestEventCode: !!metaTestEventCode,
      })

      try {
        const metaResult = await sendMetaEvent({
          eventName: "StartTrial",
          eventId: `trial-${subscription.id}`,
          eventSourceUrl: `${appUrl}/select-user`,
          userData: {
            email,
            firstName: clerkUser.firstName ?? null,
            lastName: clerkUser.lastName ?? null,
            phone: trimmedWhatsappPhone,
            country: "DO",
            externalId: accountId,
            clientIpAddress,
            clientUserAgent,
            fbc,
            fbp,
          },
          customData: {
            currency: "DOP",
            value: Number((subscription.priceDopCents / 100).toFixed(2)),
            predicted_ltv: Number((subscription.priceDopCents / 100).toFixed(2)),
          },
          testEventCode: metaTestEventCode,
        })

        metaDebugLog("createFirstUser: resultado StartTrial", {
          accountId,
          ok: metaResult.ok,
          skipped: metaResult.skipped ?? false,
          status: metaResult.status ?? null,
          reason: metaResult.reason ?? null,
          body: metaResult.body ?? null,
        })

        if (!metaResult.ok) {
          console.error("[Meta] StartTrial no se envio correctamente", {
            accountId,
            status: metaResult.status ?? null,
            skipped: metaResult.skipped ?? false,
            reason: metaResult.reason ?? null,
            body: metaResult.body ?? null,
          })
        }
      } catch (metaError) {
        console.error("[Meta] Error enviando evento StartTrial:", metaError)
      }
    } else {
      metaDebugLog("createFirstUser: StartTrial no enviado porque ya existe suscripción", {
        accountId,
        existingSubscriptionId: existingSubscription.id,
        existingSubscriptionStatus: existingSubscription.status,
      })
    }
  } catch (error) {
    console.error("Error creating billing subscription:", error)
    // No bloquear el onboarding si billing falla
  }

  await logAuditEvent({
    accountId,
    userId: createdUser.id,
    userEmail: createdUser.email,
    userUsername: createdUser.username,
    action: "USER_CREATED",
    resourceType: "User",
    resourceId: createdUser.id,
    details: {
      username: createdUser.username,
      name: createdUser.name,
      role: createdUser.role,
      email: createdUser.email,
      isOwner: true,
      source: "first_user",
    },
  })

  await logAuditEvent({
    accountId,
    userId: createdUser.id,
    userEmail: createdUser.email,
    userUsername: createdUser.username,
    action: "SETTINGS_CHANGED",
    resourceType: "CompanySettings",
    details: {
      name: trimmedBusinessName,
      logoUrl,
    },
  })

  // Autenticar automáticamente al usuario recién creado
  const authResult = await authenticateSubUser(accountId, trimmedUsername, password)

  if (!authResult.success || !authResult.user) {
    return { error: "Usuario creado pero error al iniciar sesión. Por favor, inicia sesión manualmente." }
  }

  // Crear sesión
  const token = await createSubUserSession(accountId, authResult.user.id)
  await setSubUserSessionCookie(token)

  // Redirigir al dashboard
  redirect("/dashboard")
}

export async function sendSubUserTemporaryCode(formData: FormData) {
  const accountId = formData.get("accountId") as string
  const username = formData.get("username") as string

  if (!accountId || !username) {
    return { error: "Todos los campos son requeridos" }
  }

  try {
    checkRateLimit(`temp-code-request:${accountId}:${username}`, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 3,
      blockDurationMs: 5 * 60 * 1000,
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        error: `Demasiadas solicitudes. Intenta de nuevo en ${error.retryAfter} segundos.`,
      }
    }
  }

  const isAuthenticated = await isClerkAuthenticated()
  if (!isAuthenticated) {
    return { error: "Sesión de cuenta principal expirada. Por favor, inicia sesión de nuevo." }
  }

  const { prisma } = await import("@/lib/db")
  const user = await prisma.user.findUnique({
    where: {
      accountId_username: {
        accountId,
        username,
      },
    },
  })

  if (!user) {
    return { error: "Usuario no encontrado" }
  }

  if (!user.isActive) {
    return { error: "Usuario desactivado" }
  }

  if (!user.email) {
    return { error: "El usuario no tiene un email registrado" }
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0")
  const bcrypt = await import("bcryptjs")
  const codeHash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await prisma.subUserLoginToken.create({
    data: {
      accountId,
      userId: user.id,
      codeHash,
      expiresAt,
    },
  })

  const displayName = user.name || user.username
  const { subject, html } = await renderSubUserTemporaryCodeEmail({
    name: displayName,
    username: user.username,
    code,
  })

  const emailSent = await sendResendEmail({
    to: user.email,
    subject,
    html,
  })

  if (!emailSent) {
    return { error: "No se pudo enviar el correo. Intenta más tarde." }
  }

  console.log("Temporary code sent", { accountId, username, email: user.email, code })

  await logAuditEvent({
    accountId,
    userId: user.id,
    action: "PASSWORD_RESET_REQUESTED",
    resourceType: "User",
    resourceId: user.id,
    details: {
      username,
      email: user.email,
    },
  })

  return { success: true, email: user.email }
}

export async function loginSubUserWithCode(formData: FormData) {
  const accountId = formData.get("accountId") as string
  const username = formData.get("username") as string
  const codeRaw = formData.get("code") as string
  const code = codeRaw?.trim()

  if (!accountId || !username || !code) {
    return { error: "Todos los campos son requeridos" }
  }

  if (!/^[0-9]{6}$/.test(code)) {
    return { error: "El código debe tener 6 dígitos" }
  }

  try {
    checkRateLimit(`temp-code-verify:${accountId}:${username}`, {
      windowMs: 60 * 1000,
      maxRequests: 4,
      blockDurationMs: 5 * 60 * 1000,
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        error: `Demasiados intentos. Intenta de nuevo en ${error.retryAfter} segundos.`,
      }
    }
  }

  const isAuthenticated = await isClerkAuthenticated()
  if (!isAuthenticated) {
    return { error: "Sesión de cuenta principal expirada. Por favor, inicia sesión de nuevo." }
  }

  const { prisma } = await import("@/lib/db")
  const user = await prisma.user.findUnique({
    where: {
      accountId_username: {
        accountId,
        username,
      },
    },
  })

  if (!user) {
    return { error: "Usuario no encontrado" }
  }

  if (!user.isActive) {
    return { error: "Usuario desactivado" }
  }

  const now = new Date()
  const token = await prisma.subUserLoginToken.findFirst({
    where: {
      accountId,
      userId: user.id,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  })

  console.log("Retrieved token", { tokenId: token?.id, expiresAt: token?.expiresAt })

  if (!token) {
    return { error: "Código inválido o expirado" }
  }

  const bcrypt = await import("bcryptjs")
  const isValidCode = await bcrypt.compare(code, token.codeHash)

  console.log("Code validation", { code, isValidCode })

  if (!isValidCode) {
    return { error: "Código inválido" }
  }

  await prisma.subUserLoginToken.update({
    where: { id: token.id },
    data: { usedAt: new Date() },
  })

  await logAuditEvent({
    accountId,
    userId: user.id,
    action: "PASSWORD_RESET_COMPLETED",
    resourceType: "User",
    resourceId: user.id,
    details: {
      username,
      method: "temporary_code",
    },
  })

  await logAuditEvent({
    accountId,
    userId: user.id,
    action: "LOGIN_SUCCESS",
    resourceType: "User",
    resourceId: user.id,
    details: {
      username,
      method: "temporary_code",
    },
  })

  const sessionToken = await createSubUserSession(accountId, user.id)
  await setSubUserSessionCookie(sessionToken)

  console.log("Temporary login success, session cookie set", { accountId, userId: user.id })

  redirect("/dashboard")
}
