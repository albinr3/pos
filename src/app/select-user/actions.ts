"use server"

import { redirect } from "next/navigation"
import { currentUser } from "@clerk/nextjs/server"
import {
  getOrCreateAccount,
  listSubUsers,
  authenticateSubUser,
  createSubUserSession,
  setSubUserSessionCookie,
  isClerkAuthenticated,
} from "@/lib/auth"

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

  if (!accountId || !password) {
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
  if (users.length > 0) {
    return { error: "Ya existen usuarios en esta cuenta" }
  }

  const { prisma } = await import("@/lib/db")
  const bcrypt = await import("bcryptjs")

  // Obtener datos del usuario de Clerk
  const email = clerkUser.emailAddresses?.[0]?.emailAddress
  const name = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "Usuario"
  const ownerUsername = email ? email.split("@")[0] : "admin"

  // Crear el primer usuario directamente como owner
  const passwordHash = await bcrypt.hash(password, 10)
  const trimmedUsername = ownerUsername.trim().toLowerCase()

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

  // Crear usuario como owner
  const newUser = await prisma.user.create({
    data: {
      accountId,
      name: name,
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
