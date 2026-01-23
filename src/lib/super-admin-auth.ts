/**
 * Sistema de autenticación para Super Admin
 * Completamente separado de la autenticación de clientes
 */

import { cookies } from "next/headers"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import type { Prisma, SuperAdminRole } from "@prisma/client"

// ==========================================
// TYPES
// ==========================================

export type SuperAdminUser = {
  id: string
  email: string
  name: string
  role: SuperAdminRole
  canManageAccounts: boolean
  canApprovePayments: boolean
  canModifyPricing: boolean
  canSendEmails: boolean
  canDeleteAccounts: boolean
  canViewFinancials: boolean
}

// ==========================================
// CONSTANTS
// ==========================================

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required for super admin auth")
}

const SUPER_ADMIN_COOKIE_NAME = "superadmin-session"
const SESSION_DURATION = 60 * 60 * 4 // 4 horas (más corto por seguridad)

interface SuperAdminSessionPayload {
  superAdminId: string
  iat: number
  exp: number
}

// ==========================================
// HELPER
// ==========================================

async function getPrisma() {
  const { prisma } = await import("@/lib/db")
  return prisma
}

// ==========================================
// AUTHENTICATION
// ==========================================

/**
 * Autentica un super admin con email y contraseña
 */
export async function authenticateSuperAdmin(
  email: string,
  password: string
): Promise<{ success: boolean; user?: SuperAdminUser; error?: string }> {
  try {
    const prisma = await getPrisma()
    
    const admin = await prisma.superAdmin.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (!admin) {
      return { success: false, error: "Credenciales inválidas" }
    }

    if (!admin.isActive) {
      return { success: false, error: "Cuenta desactivada" }
    }

    const isValidPassword = await bcrypt.compare(password, admin.passwordHash)
    if (!isValidPassword) {
      return { success: false, error: "Credenciales inválidas" }
    }

    // Actualizar último login
    await prisma.superAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    // Log de auditoría
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId: admin.id,
        action: "login_success",
      },
    })

    return {
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        canManageAccounts: admin.canManageAccounts,
        canApprovePayments: admin.canApprovePayments,
        canModifyPricing: admin.canModifyPricing,
        canSendEmails: admin.canSendEmails,
        canDeleteAccounts: admin.canDeleteAccounts,
        canViewFinancials: admin.canViewFinancials,
      },
    }
  } catch (error) {
    console.error("Error authenticating super admin:", error)
    return { success: false, error: "Error de autenticación" }
  }
}

/**
 * Crea una sesión JWT para super admin
 */
export function createSuperAdminSession(superAdminId: string): string {
  return jwt.sign({ superAdminId }, JWT_SECRET!, {
    expiresIn: SESSION_DURATION,
  })
}

/**
 * Establece la cookie de sesión
 */
export async function setSuperAdminSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SUPER_ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", // Más restrictivo por seguridad
    maxAge: SESSION_DURATION,
    path: "/",
  })
}

/**
 * Elimina la cookie de sesión
 */
export async function clearSuperAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SUPER_ADMIN_COOKIE_NAME)
}

/**
 * Obtiene el super admin actual de la sesión
 */
export async function getCurrentSuperAdmin(): Promise<SuperAdminUser | null> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SUPER_ADMIN_COOKIE_NAME)?.value

    if (!sessionToken) {
      return null
    }

    const payload = jwt.verify(sessionToken, JWT_SECRET!) as SuperAdminSessionPayload
    
    const prisma = await getPrisma()
    const admin = await prisma.superAdmin.findUnique({
      where: { id: payload.superAdminId },
    })

    if (!admin || !admin.isActive) {
      return null
    }

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      canManageAccounts: admin.canManageAccounts,
      canApprovePayments: admin.canApprovePayments,
      canModifyPricing: admin.canModifyPricing,
      canSendEmails: admin.canSendEmails,
      canDeleteAccounts: admin.canDeleteAccounts,
      canViewFinancials: admin.canViewFinancials,
    }
  } catch {
    return null
  }
}

/**
 * Verifica si hay sesión de super admin activa
 */
export async function hasSuperAdminSession(): Promise<boolean> {
  const admin = await getCurrentSuperAdmin()
  return admin !== null
}

// ==========================================
// AUDIT LOG
// ==========================================

/**
 * Registra una acción del super admin
 */
export async function logSuperAdminAction(
  superAdminId: string,
  action: string,
  options?: {
    targetAccountId?: string
    targetPaymentId?: string
    metadata?: Prisma.InputJsonValue
    ipAddress?: string
  }
) {
  try {
    const prisma = await getPrisma()
    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId,
        action,
        targetAccountId: options?.targetAccountId,
        targetPaymentId: options?.targetPaymentId,
        metadata: options?.metadata,
        ipAddress: options?.ipAddress,
      },
    })
  } catch (error) {
    console.error("Error logging super admin action:", error)
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Crea un nuevo super admin (solo para setup inicial o desde consola)
 */
export async function createSuperAdmin(data: {
  email: string
  name: string
  password: string
  role?: SuperAdminRole
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const prisma = await getPrisma()
    
    const existing = await prisma.superAdmin.findUnique({
      where: { email: data.email.toLowerCase() },
    })

    if (existing) {
      return { success: false, error: "El email ya está registrado" }
    }

    const passwordHash = await bcrypt.hash(data.password, 12)
    const role = data.role || "SUPPORT"

    // Asignar permisos basados en el rol
    const permissions = getPermissionsForRole(role)

    const admin = await prisma.superAdmin.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash,
        role,
        ...permissions,
      },
    })

    return { success: true, id: admin.id }
  } catch (error) {
    console.error("Error creating super admin:", error)
    return { success: false, error: "Error al crear super admin" }
  }
}

/**
 * Obtiene permisos por defecto según el rol
 */
function getPermissionsForRole(role: SuperAdminRole) {
  switch (role) {
    case "OWNER":
      return {
        canManageAccounts: true,
        canApprovePayments: true,
        canModifyPricing: true,
        canSendEmails: true,
        canDeleteAccounts: true,
        canViewFinancials: true,
      }
    case "ADMIN":
      return {
        canManageAccounts: true,
        canApprovePayments: true,
        canModifyPricing: false,
        canSendEmails: true,
        canDeleteAccounts: false,
        canViewFinancials: true,
      }
    case "FINANCE":
      return {
        canManageAccounts: false,
        canApprovePayments: true,
        canModifyPricing: false,
        canSendEmails: false,
        canDeleteAccounts: false,
        canViewFinancials: true,
      }
    case "SUPPORT":
    default:
      return {
        canManageAccounts: false,
        canApprovePayments: false,
        canModifyPricing: false,
        canSendEmails: false,
        canDeleteAccounts: false,
        canViewFinancials: false,
      }
  }
}
