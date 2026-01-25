/**
 * Sistema de autenticación multi-tenant
 * 
 * Flujo de autenticación:
 * 1. Usuario se autentica con Clerk (Google/Email/WhatsApp)
 * 2. Se obtiene/crea el Account (tenant) basado en clerkUserId
 * 3. Usuario selecciona subusuario e ingresa contraseña
 * 4. Se crea sesión con accountId + userId (subusuario)
 */

import { auth, currentUser } from "@clerk/nextjs/server"
import { cookies } from "next/headers"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import type { UserRole } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit-log"
import { createBillingSubscription, getBillingState, type BillingState } from "@/lib/billing"

// Función helper para obtener prisma de forma segura
async function getPrisma() {
  const { prisma } = await import("@/lib/db")
  if (!prisma) {
    throw new Error("Prisma client no está inicializado")
  }
  return prisma
}

// ==========================================
// TYPES
// ==========================================

export type CurrentUser = {
  id: string
  accountId: string
  username: string
  name: string
  email?: string | null
  role: UserRole
  isOwner: boolean
  canOverridePrice: boolean
  canCancelSales: boolean
  canCancelReturns: boolean
  canCancelPayments: boolean
  canEditSales: boolean
  canEditProducts: boolean
  canChangeSaleType: boolean
  canSellWithoutStock: boolean
  canManageBackups: boolean
  canViewProductCosts: boolean
  canViewProfitReport: boolean
}

export type AccountInfo = {
  id: string
  name: string
  clerkUserId: string
}

export type SubUser = {
  id: string
  name: string
  username: string
  role: UserRole
  isOwner: boolean
  email?: string | null
}

// ==========================================
// CONSTANTS
// ==========================================

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  console.error("\n" + "=".repeat(80))
  console.error("🚨 FATAL ERROR: JWT_SECRET no está configurado")
  console.error("=".repeat(80))
  console.error("Las sesiones no pueden ser aseguradas sin JWT_SECRET.")
  console.error("Para generar uno seguro, ejecuta en tu terminal:")
  console.error("\n  openssl rand -base64 32")
  console.error("\nLuego agrega a tu archivo .env:")
  console.error("  JWT_SECRET=tu_secreto_generado_aqui")
  console.error("=".repeat(80) + "\n")
  throw new Error("JWT_SECRET is required")
}

// Validar longitud en producción
if (process.env.NODE_ENV === "production" && JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET debe tener al menos 32 caracteres en producción")
}
const JWT_SECRET_VALUE = JWT_SECRET as string
const SESSION_COOKIE_NAME = "movopos-session"

interface SessionPayload {
  accountId: string
  userId: string
  iat: number
  exp: number
}

// ==========================================
// CLERK / ACCOUNT FUNCTIONS
// ==========================================

/**
 * Verifica si hay sesión de Clerk activa
 */
export async function isClerkAuthenticated(): Promise<boolean> {
  try {
    const clerkAuth = await auth()
    return !!clerkAuth?.userId
  } catch {
    return false
  }
}

/**
 * Obtiene el clerkUserId de la sesión actual
 */
export async function getClerkUserId(): Promise<string | null> {
  try {
    const clerkAuth = await auth()
    return clerkAuth?.userId || null
  } catch {
    return null
  }
}

/**
 * Obtiene o crea el Account (tenant) basado en el clerkUserId
 * Si es un nuevo usuario, crea el Account y un usuario owner por defecto
 */
export async function getOrCreateAccount(): Promise<AccountInfo | null> {
  try {
    const clerkAuth = await auth()
    if (!clerkAuth?.userId) {
      return null
    }

    const clerkUser = await currentUser()
    if (!clerkUser) {
      return null
    }

    // Buscar Account existente
    const prisma = await getPrisma()
    let account = await prisma.account.findUnique({
      where: { clerkUserId: clerkAuth.userId },
    })

    // Si no existe, crear nuevo Account con usuario owner
    let accountWasJustCreated = false
    if (!account) {
      const email = clerkUser.emailAddresses?.[0]?.emailAddress
      const name = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "Mi Negocio"

      try {
        account = await prisma.account.create({
          data: {
            name: name,
            clerkUserId: clerkAuth.userId,
          },
        })
        accountWasJustCreated = true
      } catch (createError: any) {
        // Si hay una violación de restricción única (otra solicitud ya creó el Account),
        // buscar nuevamente el Account existente
        if (createError?.code === "P2002") {
          account = await prisma.account.findUnique({
            where: { clerkUserId: clerkAuth.userId },
          })
          if (!account) {
            // Si aún no existe, lanzar el error original
            throw createError
          }
          // Account ya existe, no fue creado en esta ejecución
          accountWasJustCreated = false
        } else {
          throw createError
        }
      }

      // Solo crear configuraciones iniciales si acabamos de crear el Account
      // NOTA: No creamos usuario automáticamente, el usuario debe crear su contraseña
      if (accountWasJustCreated) {
        // Crear configuraciones iniciales
        await prisma.companySettings.create({
          data: {
            accountId: account.id,
            name: name,
            phone: "",
            address: "",
          },
        })

        await prisma.invoiceSequence.create({
          data: {
            accountId: account.id,
            series: "A",
            lastNumber: 0,
          },
        })

        await prisma.returnSequence.create({
          data: {
            accountId: account.id,
            lastNumber: 0,
          },
        })

        await prisma.quoteSequence.create({
          data: {
            accountId: account.id,
            lastNumber: 0,
          },
        })

        // Crear cliente genérico
        try {
          await prisma.customer.create({
            data: {
              accountId: account.id,
              name: "Cliente general",
              isGeneric: true,
              isActive: true,
            },
          })
        } catch (error: any) {
          // Si ya existe (error de constraint o condición de carrera), ignorar
          if (error?.code !== "P2002") {
            throw error
          }
        }
      }
    }

    // Asegurarse de que el cliente genérico exista (verificación final)
    // Usar findFirst para evitar crear duplicados en condiciones de carrera
    const existingGeneric = await prisma.customer.findFirst({
      where: {
        accountId: account.id,
        isGeneric: true,
      },
    })

    // Solo crear si realmente no existe
    if (!existingGeneric) {
      try {
        await prisma.customer.create({
          data: {
            accountId: account.id,
            name: "Cliente general",
            isGeneric: true,
            isActive: true,
          },
        })
      } catch (error: any) {
        // Si ya existe por condición de carrera, ignorar silenciosamente
        if (error?.code !== "P2002") {
          console.error("Error creando cliente genérico:", error)
        }
      }
    }

    return {
      id: account.id,
      name: account.name,
      clerkUserId: account.clerkUserId,
    }
  } catch (error) {
    console.error("Error getting/creating account:", error)
    return null
  }
}

/**
 * Actualiza el clerkUserId de un Account existente (para migración)
 */
export async function linkAccountToClerk(accountId: string, clerkUserId: string): Promise<boolean> {
  try {
    const prisma = await getPrisma()
    await prisma.account.update({
      where: { id: accountId },
      data: { clerkUserId },
    })
    return true
  } catch {
    return false
  }
}

// ==========================================
// SUB-USER FUNCTIONS
// ==========================================

/**
 * Lista los subusuarios de un Account
 */
export async function listSubUsers(accountId: string): Promise<SubUser[]> {
  const prisma = await getPrisma()
  const users = await prisma.user.findMany({
    where: {
      accountId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      isOwner: true,
      email: true,
    },
    orderBy: [
      { isOwner: "desc" },
      { name: "asc" },
    ],
  })

  return users
}

/**
 * Autentica un subusuario con username y password
 */
export async function authenticateSubUser(
  accountId: string,
  username: string,
  password: string
): Promise<{ success: boolean; user?: CurrentUser; error?: string }> {
  try {
    const prisma = await getPrisma()
    const user = await prisma.user.findUnique({
      where: {
        accountId_username: {
          accountId,
          username,
        },
      },
    })

    if (!user) {
      await logAuditEvent({
        accountId,
        action: "LOGIN_FAILED",
        resourceType: "User",
        details: { username },
      })
      return { success: false, error: "Usuario no encontrado" }
    }

    if (!user.isActive) {
      await logAuditEvent({
        accountId,
        userId: user.id,
        action: "LOGIN_FAILED",
        resourceType: "User",
        resourceId: user.id,
        details: { username, reason: "inactive" },
      })
      return { success: false, error: "Usuario desactivado" }
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      await logAuditEvent({
        accountId,
        userId: user.id,
        action: "LOGIN_FAILED",
        resourceType: "User",
        resourceId: user.id,
        details: { username, reason: "invalid_password" },
      })
      return { success: false, error: "Contraseña incorrecta" }
    }

    await logAuditEvent({
      accountId,
      userId: user.id,
      action: "LOGIN_SUCCESS",
      resourceType: "User",
      resourceId: user.id,
      details: { username },
    })

    return {
      success: true,
      user: {
        id: user.id,
        accountId: user.accountId,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        isOwner: user.isOwner,
        canOverridePrice: user.canOverridePrice,
        canCancelSales: user.canCancelSales,
        canCancelReturns: user.canCancelReturns,
        canCancelPayments: user.canCancelPayments,
        canEditSales: user.canEditSales,
        canEditProducts: user.canEditProducts,
        canChangeSaleType: user.canChangeSaleType,
        canSellWithoutStock: user.canSellWithoutStock,
        canManageBackups: user.canManageBackups,
        canViewProductCosts: user.canViewProductCosts,
        canViewProfitReport: user.canViewProfitReport,
      },
    }
  } catch (error) {
    console.error("Error authenticating sub-user:", error)
    return { success: false, error: "Error de autenticación" }
  }
}

/**
 * Crea un nuevo subusuario
 */
export async function createSubUser(
  accountId: string,
  data: {
    name: string
    username: string
    password: string
    role: UserRole
    isOwner?: boolean
    permissions?: Partial<{
      canOverridePrice: boolean
      canCancelSales: boolean
      canCancelReturns: boolean
      canCancelPayments: boolean
      canEditSales: boolean
      canEditProducts: boolean
      canChangeSaleType: boolean
      canSellWithoutStock: boolean
      canManageBackups: boolean
      canViewProductCosts: boolean
      canViewProfitReport: boolean
    }>
  }
): Promise<{ success: boolean; user?: SubUser; error?: string }> {
  try {
    const prisma = await getPrisma()
    // Verificar que el username no exista en el account
    const existing = await prisma.user.findUnique({
      where: {
        accountId_username: {
          accountId,
          username: data.username,
        },
      },
    })

    if (existing) {
      return { success: false, error: "El nombre de usuario ya existe" }
    }

    const passwordHash = await bcrypt.hash(data.password, 10)
    const isOwner = data.isOwner ?? false

    const user = await prisma.user.create({
      data: {
        accountId,
        name: data.name,
        username: data.username,
        passwordHash,
        role: data.role,
        isOwner,
        ...data.permissions,
      },
    })

    // Si es el primer usuario owner, crear la suscripción de billing
    if (isOwner) {
      const existingSubscription = await prisma.billingSubscription.findUnique({
        where: { accountId },
      })

      if (!existingSubscription) {
        try {
          await createBillingSubscription({ accountId })
        } catch (billingError) {
          console.error("Error creating billing subscription:", billingError)
          // No fallar la creación del usuario por esto
        }
      }
    }

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        isOwner: user.isOwner,
      },
    }
  } catch (error) {
    console.error("Error creating sub-user:", error)
    return { success: false, error: "Error al crear usuario" }
  }
}

// ==========================================
// SESSION FUNCTIONS
// ==========================================

/**
 * Crea una sesión JWT para un subusuario
 */
export async function createSubUserSession(accountId: string, userId: string): Promise<string> {
  const token = jwt.sign({ accountId, userId }, JWT_SECRET_VALUE, {
    expiresIn: "7d",
  })
  return token
}

/**
 * Establece la cookie de sesión del subusuario
 */
export async function setSubUserSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 días
    path: "/",
  })
}

/**
 * Elimina la cookie de sesión del subusuario
 */
export async function clearSubUserSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

/**
 * Obtiene la sesión actual del subusuario
 */
export async function getSubUserSession(): Promise<{ accountId: string; userId: string } | null> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!sessionToken) {
    return null
  }

  try {
    const payload = jwt.verify(sessionToken, JWT_SECRET_VALUE) as SessionPayload
    return {
      accountId: payload.accountId,
      userId: payload.userId,
    }
  } catch {
    return null
  }
}

// ==========================================
// MAIN AUTH FUNCTION
// ==========================================

/**
 * Obtiene el usuario actual (requiere sesión de Clerk + sesión de subusuario)
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Verificar sesión de Clerk
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) {
    return null
  }

  // Verificar sesión de subusuario
  const subUserSession = await getSubUserSession()
  if (!subUserSession) {
    return null
  }

  // Verificar que el Account corresponde al clerkUserId
  const prisma = await getPrisma()
  const account = await prisma.account.findUnique({
    where: { clerkUserId },
  })

  if (!account || account.id !== subUserSession.accountId) {
    // La sesión de subusuario no corresponde al Account del Clerk actual
    // No podemos limpiar cookies aquí porque esta función puede ser llamada
    // desde Server Components. La limpieza se hace en el middleware o logout.
    return null
  }

  // Obtener el subusuario
  const user = await prisma.user.findUnique({
    where: { id: subUserSession.userId },
  })

  if (!user || !user.isActive || user.accountId !== account.id) {
    // No podemos limpiar cookies aquí porque esta función puede ser llamada
    // desde Server Components. La limpieza se hace en el middleware o logout.
    return null
  }

  const currentUser = {
    id: user.id,
    accountId: user.accountId,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    isOwner: user.isOwner,
    canOverridePrice: user.canOverridePrice,
    canCancelSales: user.canCancelSales,
    canCancelReturns: user.canCancelReturns,
    canCancelPayments: user.canCancelPayments,
    canEditSales: user.canEditSales,
    canEditProducts: user.canEditProducts,
    canChangeSaleType: user.canChangeSaleType,
    canSellWithoutStock: user.canSellWithoutStock,
    canManageBackups: user.canManageBackups,
    canViewProductCosts: user.canViewProductCosts,
    canViewProfitReport: user.canViewProfitReport,
  }
  
  return currentUser
}

/**
 * Verifica si el usuario tiene sesión completa (Clerk + subusuario)
 */
export async function hasCompleteSession(): Promise<boolean> {
  const user = await getCurrentUser()
  return user !== null
}

/**
 * Verifica solo si hay sesión de Clerk (para redirigir a selección de usuario)
 */
export async function hasClerkSession(): Promise<boolean> {
  return await isClerkAuthenticated()
}

/**
 * Verifica solo si hay sesión de subusuario (sin validar Clerk)
 */
export async function hasSubUserSession(): Promise<boolean> {
  const session = await getSubUserSession()
  return session !== null
}

// ==========================================
// LEGACY COMPATIBILITY (para migración gradual)
// ==========================================

// Estas funciones se mantienen para compatibilidad con código existente
// pero ahora usan el nuevo sistema

export async function createSession(userId: string): Promise<string> {
  // Buscar el accountId del usuario
  const prisma = await getPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountId: true },
  })
  if (!user) throw new Error("User not found")
  return createSubUserSession(user.accountId, userId)
}

export async function setSessionCookie(token: string) {
  return setSubUserSessionCookie(token)
}

export async function clearSessionCookie() {
  return clearSubUserSession()
}

// ==========================================
// BILLING HELPERS
// ==========================================

/**
 * Obtiene el estado de billing del usuario actual
 */
export async function getCurrentUserBillingState(): Promise<BillingState | null> {
  const user = await getCurrentUser()
  if (!user) return null
  return getBillingState(user.accountId)
}

/**
 * Re-exportar BillingState para uso en componentes
 */
export type { BillingState }
