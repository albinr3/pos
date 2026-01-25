"use server"

import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import type { UserRole } from "@prisma/client"
import { logAuditEvent } from "@/lib/audit-log"
import { sendResendEmail } from "@/lib/resend"
import { renderWelcomeNewUserEmail } from "@/lib/resend/templates"
import { sanitizeEmail } from "@/lib/sanitize"

export type UserWithPermissions = {
  id: string
  name: string
  username: string
  email: string | null
  role: UserRole
  isOwner: boolean
  isActive: boolean
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
  createdAt: Date
}

export async function listAccountUsers(): Promise<UserWithPermissions[]> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new Error("No autenticado")
  }

  const users = await prisma.user.findMany({
    where: { accountId: currentUser.accountId },
    orderBy: [{ isOwner: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      isOwner: true,
      isActive: true,
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
      createdAt: true,
    },
  })

  return users
}

export async function createUser(data: {
  name: string
  username: string
  password: string
  email?: string
  role: UserRole
  permissions: {
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
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new Error("No autenticado")
  }

  // Solo el owner puede crear usuarios
  if (!currentUser.isOwner) {
    throw new Error("Solo el dueño de la cuenta puede crear usuarios")
  }

  // Verificar que el username no exista
  const existing = await prisma.user.findUnique({
    where: {
      accountId_username: {
        accountId: currentUser.accountId,
        username: data.username,
      },
    },
  })

  if (existing) {
    throw new Error("El nombre de usuario ya existe")
  }

  // Validar contraseña
  if (data.password.length < 4) {
    throw new Error("La contraseña debe tener al menos 4 caracteres")
  }

  const normalizedEmail = data.email ? sanitizeEmail(data.email) : null
  if (data.email && !normalizedEmail) {
    throw new Error("Email inválido")
  }

  const passwordHash = await bcrypt.hash(data.password, 10)

  const created = await prisma.user.create({
    data: {
      accountId: currentUser.accountId,
      name: data.name,
      username: data.username,
      email: normalizedEmail,
      passwordHash,
      role: data.role,
      isOwner: false,
      ...data.permissions,
    },
  })

  let welcomeEmailSent: boolean | null = null
  if (created.email) {
    try {
      const { subject, html } = await renderWelcomeNewUserEmail({
        name: created.name,
        username: created.username,
        temporaryPassword: data.password,
      })
      const emailSent = await sendResendEmail({
        to: created.email,
        subject,
        html,
        accountId: currentUser.accountId,
        userId: currentUser.id,
      })

      if (!emailSent) {
        console.warn("No se pudo enviar el correo de bienvenida a", created.email)
      }
      welcomeEmailSent = emailSent
    } catch (error) {
      console.error("Error preparando correo de bienvenida:", error)
      welcomeEmailSent = false
    }
  }

  await logAuditEvent({
    accountId: currentUser.accountId,
    userId: currentUser.id,
    userEmail: currentUser.email ?? null,
    userUsername: currentUser.username ?? null,
    action: "USER_CREATED",
    resourceType: "User",
    resourceId: created.id,
    details: {
      username: created.username,
      name: created.name,
      role: created.role,
      email: created.email,
      permissions: data.permissions,
    },
  })

  revalidatePath("/settings")
  return { emailSent: welcomeEmailSent }
}

export async function updateUser(
  userId: string,
  data: {
    name?: string
    username?: string
    email?: string
    role?: UserRole
    isActive?: boolean
    password?: string
    permissions?: {
      canOverridePrice?: boolean
      canCancelSales?: boolean
      canCancelReturns?: boolean
      canCancelPayments?: boolean
      canEditSales?: boolean
      canEditProducts?: boolean
      canChangeSaleType?: boolean
      canSellWithoutStock?: boolean
      canManageBackups?: boolean
      canViewProductCosts?: boolean
      canViewProfitReport?: boolean
    }
  }
) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new Error("No autenticado")
  }

  // Verificar que el usuario pertenece al mismo account
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user || user.accountId !== currentUser.accountId) {
    throw new Error("Usuario no encontrado")
  }

  // Solo el owner puede editar otros usuarios
  if (!currentUser.isOwner && currentUser.id !== userId) {
    throw new Error("No tienes permisos para editar este usuario")
  }

  // No se puede desactivar al owner
  if (user.isOwner && data.isActive === false) {
    throw new Error("No se puede desactivar al dueño de la cuenta")
  }

  // Si se cambia el username, verificar que no exista
  if (data.username && data.username !== user.username) {
    const existing = await prisma.user.findUnique({
      where: {
        accountId_username: {
          accountId: currentUser.accountId,
          username: data.username,
        },
      },
    })

    if (existing) {
      throw new Error("El nombre de usuario ya existe")
    }
  }

  // Preparar datos de actualización
  const updateData: Record<string, unknown> = {}
  const changes: Record<string, unknown> = {}

  if (data.name !== undefined) {
    updateData.name = data.name
    if (data.name !== user.name) changes.name = data.name
  }
  if (data.username !== undefined) {
    updateData.username = data.username
    if (data.username !== user.username) changes.username = data.username
  }
  if (data.email !== undefined) {
    updateData.email = data.email || null
    if ((data.email || null) !== user.email) changes.email = data.email || null
  }
  if (data.role !== undefined) {
    updateData.role = data.role
    if (data.role !== user.role) changes.role = data.role
  }
  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive
    if (data.isActive !== user.isActive) changes.isActive = data.isActive
  }

  if (data.password) {
    if (data.password.length < 4) {
      throw new Error("La contraseña debe tener al menos 4 caracteres")
    }
    updateData.passwordHash = await bcrypt.hash(data.password, 10)
    changes.passwordChanged = true
  }

  if (data.permissions) {
    Object.assign(updateData, data.permissions)
    const permissionChanges: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(data.permissions)) {
      if (value === undefined) continue
      const currentValue = user[key as keyof typeof user] as boolean | undefined
      if (currentValue !== value) {
        permissionChanges[key] = value
      }
    }
    if (Object.keys(permissionChanges).length > 0) {
      changes.permissions = permissionChanges
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  })

  const action = data.isActive === false && user.isActive ? "USER_DEACTIVATED" : "USER_UPDATED"
  await logAuditEvent({
    accountId: currentUser.accountId,
    userId: currentUser.id,
    userEmail: currentUser.email ?? null,
    userUsername: currentUser.username ?? null,
    action,
    resourceType: "User",
    resourceId: userId,
    details: {
      changes,
    },
  })

  if (changes.permissions) {
    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "PERMISSION_CHANGED",
      resourceType: "User",
      resourceId: userId,
      details: {
        permissions: changes.permissions,
      },
    })
  }

  revalidatePath("/settings")
}

export async function deleteUser(userId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new Error("No autenticado")
  }

  // Solo el owner puede eliminar usuarios
  if (!currentUser.isOwner) {
    throw new Error("Solo el dueño de la cuenta puede eliminar usuarios")
  }

  // Verificar que el usuario pertenece al mismo account
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user || user.accountId !== currentUser.accountId) {
    throw new Error("Usuario no encontrado")
  }

  // No se puede eliminar al owner
  if (user.isOwner) {
    throw new Error("No se puede eliminar al dueño de la cuenta")
  }

  // No se puede eliminar a sí mismo
  if (user.id === currentUser.id) {
    throw new Error("No puedes eliminarte a ti mismo")
  }

  await prisma.user.delete({
    where: { id: userId },
  })

  await logAuditEvent({
    accountId: currentUser.accountId,
    userId: currentUser.id,
    userEmail: currentUser.email ?? null,
    userUsername: currentUser.username ?? null,
    action: "USER_DELETED",
    resourceType: "User",
    resourceId: userId,
    details: {
      username: user.username,
      name: user.name,
      role: user.role,
      email: user.email,
    },
  })

  revalidatePath("/settings")
}

export async function setAllUserPermissions(userId: string, value: boolean) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new Error("No autenticado")
  }

  // Solo el owner puede cambiar permisos
  if (!currentUser.isOwner) {
    throw new Error("Solo el dueño de la cuenta puede cambiar permisos")
  }

  // Verificar que el usuario pertenece al mismo account
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user || user.accountId !== currentUser.accountId) {
    throw new Error("Usuario no encontrado")
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      canOverridePrice: value,
      canCancelSales: value,
      canCancelReturns: value,
      canCancelPayments: value,
      canEditSales: value,
      canEditProducts: value,
      canChangeSaleType: value,
      canSellWithoutStock: value,
      canManageBackups: value,
      canViewProductCosts: value,
      canViewProfitReport: value,
    },
  })

  await logAuditEvent({
    accountId: currentUser.accountId,
    userId: currentUser.id,
    userEmail: currentUser.email ?? null,
    userUsername: currentUser.username ?? null,
    action: "PERMISSION_CHANGED",
    resourceType: "User",
    resourceId: userId,
    details: {
      setAll: true,
      value,
    },
  })

  revalidatePath("/settings")
}
