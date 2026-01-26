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
import { logError, ErrorCodes } from "@/lib/error-logger"

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
 * Obtiene el clerkUserId desde un token JWT del header Authorization
 * Útil para peticiones desde la app móvil
 */
export async function getClerkUserIdFromToken(token: string | null): Promise<string | null> {
  if (!token) {
    console.log("⚠️ [getClerkUserIdFromToken] Token es null")
    return null
  }

  try {
    // Remover "Bearer " si está presente
    const cleanToken = token.replace(/^Bearer\s+/i, '')
    console.log("🔍 [getClerkUserIdFromToken] Token limpio (primeros 20 chars):", cleanToken.substring(0, 20) + "...")
    
    // Decodificar el JWT para obtener el userId
    // Clerk usa JWTs estándar, podemos decodificarlo sin verificar la firma
    // ya que solo necesitamos el userId, no la verificación completa
    const parts = cleanToken.split('.')
    if (parts.length !== 3) {
      console.error("❌ [getClerkUserIdFromToken] Token no tiene formato JWT válido (3 partes)")
      return null
    }

    // Decodificar el payload (segunda parte del JWT)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
    console.log("🔍 [getClerkUserIdFromToken] Payload decodificado:", JSON.stringify(payload, null, 2))
    
    // El userId está en 'sub' o 'userId' en el payload
    const userId = payload.sub || payload.userId || payload.id || null
    console.log("✅ [getClerkUserIdFromToken] userId encontrado:", userId)
    return userId
  } catch (error) {
    console.error("❌ [getClerkUserIdFromToken] Error decodificando token:", error)
    // Si falla la decodificación, intentar con auth() que puede leer del header
    try {
      const clerkAuth = await auth()
      const userId = clerkAuth?.userId || null
      console.log("🔍 [getClerkUserIdFromToken] userId desde auth():", userId)
      return userId
    } catch (authError) {
      console.error("❌ [getClerkUserIdFromToken] Error con auth():", authError)
      return null
    }
  }
}

/**
 * Obtiene o crea el Account (tenant) basado en el clerkUserId
 * Si es un nuevo usuario, crea el Account y un usuario owner por defecto
 * @param clerkUserId - Opcional: clerkUserId específico (útil para peticiones desde app móvil)
 */
export async function getOrCreateAccount(clerkUserId?: string | null): Promise<AccountInfo | null> {
  try {
    let userId: string | null = clerkUserId || null
    
    // Si no se proporciona clerkUserId, intentar obtenerlo de la sesión
    if (!userId) {
      const clerkAuth = await auth()
      userId = clerkAuth?.userId || null
    }

    if (!userId) {
      return null
    }

    // Obtener información del usuario de Clerk
    let clerkUser = null
    try {
      clerkUser = await currentUser()
    } catch {
      // Si no se puede obtener currentUser (por ejemplo, desde app móvil),
      // intentar obtenerlo usando clerkClient
      try {
        const { clerkClient } = await import("@clerk/nextjs/server")
        const client = await clerkClient()
        clerkUser = await client.users.getUser(userId)
      } catch {
        // Si no se puede obtener, usar valores por defecto
        clerkUser = null
      }
    }

    // Buscar Account existente
    const prisma = await getPrisma()
    let account = await prisma.account.findUnique({
      where: { clerkUserId: userId },
    })

    // Si no existe, crear nuevo Account con usuario owner
    let accountWasJustCreated = false
    if (!account) {
      // Si no tenemos información del usuario de Clerk, usar valores por defecto
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress || null
      const name = clerkUser 
        ? `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || "Mi Negocio"
        : "Mi Negocio"

      try {
        account = await prisma.account.create({
          data: {
            name: name,
            clerkUserId: userId,
          },
        })
        accountWasJustCreated = true
      } catch (createError: any) {
        // Si hay una violación de restricción única (otra solicitud ya creó el Account),
        // buscar nuevamente el Account existente
        if (createError?.code === "P2002") {
          account = await prisma.account.findUnique({
            where: { clerkUserId: userId },
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
  
  // Log para debug
  console.log("🔍 [listSubUsers] Buscando usuarios para accountId:", accountId)
  
  // Verificar el account
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, clerkUserId: true },
  })
  console.log("🔍 [listSubUsers] Account verificado:", account)
  
  // Primero verificar cuántos usuarios hay en total (sin filtro de isActive)
  const allUsers = await prisma.user.findMany({
    where: { accountId },
    select: { id: true, username: true, name: true, isActive: true, accountId: true },
  })
  console.log("🔍 [listSubUsers] Total de usuarios en account:", allUsers.length, allUsers.map(u => ({ username: u.username, isActive: u.isActive, accountId: u.accountId })))
  
  // Si no hay usuarios, verificar si hay usuarios en otros accounts (solo para debug)
  if (allUsers.length === 0) {
    const allAccounts = await prisma.account.findMany({
      select: { id: true, name: true, clerkUserId: true },
    })
    console.log("🔍 [listSubUsers] Todos los accounts:", allAccounts.map(a => ({ id: a.id, name: a.name, clerkUserId: a.clerkUserId })))
    
    const usersInOtherAccounts = await prisma.user.findMany({
      select: { id: true, username: true, name: true, accountId: true },
      take: 10, // Limitar a 10 para no saturar logs
    })
    console.log("🔍 [listSubUsers] Usuarios en otros accounts (primeros 10):", usersInOtherAccounts.map(u => ({ username: u.username, accountId: u.accountId })))
  }
  
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

  console.log("🔍 [listSubUsers] Usuarios activos encontrados:", users.length)
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
    await logError(error as Error, {
      code: ErrorCodes.AUTH_FAILED,
      severity: "HIGH",
      accountId,
      endpoint: "/auth/authenticateSubUser",
      metadata: { username },
    })
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
 * Puede leer desde cookies (web) o desde el header X-SubUser-Token (móvil)
 */
export async function getSubUserSession(
  subUserToken?: string | null
): Promise<{ accountId: string; userId: string } | null> {
  let sessionToken: string | null = null

  // Intentar leer del header X-SubUser-Token (para móvil)
  if (subUserToken) {
    sessionToken = subUserToken
  }

  // Si no hay token en el header, intentar leer de cookies (web)
  if (!sessionToken) {
    try {
      const cookieStore = await cookies()
      sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value || null
    } catch {
      // Si no hay cookies disponibles (por ejemplo, en API routes sin cookies)
      sessionToken = null
    }
  }

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
 * @param authHeader - Header Authorization opcional para leer token JWT (móvil)
 */
export async function getCurrentUser(
  authHeader?: string | null
): Promise<CurrentUser | null> {
  // Verificar sesión de Clerk
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) {
    return null
  }

  // Verificar sesión de subusuario (puede leer de header o cookies)
  const subUserSession = await getSubUserSession(authHeader)
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
