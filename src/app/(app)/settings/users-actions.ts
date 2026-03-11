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
import {
  ALL_PERMISSION_KEYS,
  CRITICAL_PERMISSION_KEYS,
  hasPermission,
  isCriticalPermission,
  type PermissionKey,
} from "@/lib/permissions"
import { ensurePermission, logUnauthorizedAccess } from "@/lib/permission-guard"

type PermissionState = Record<PermissionKey, boolean>
type PartialPermissionState = Partial<Record<PermissionKey, boolean>>

const USER_PERMISSION_SELECT = ALL_PERMISSION_KEYS.reduce<Record<PermissionKey, true>>((acc, key) => {
  acc[key] = true
  return acc
}, {} as Record<PermissionKey, true>)

const NON_CRITICAL_PERMISSION_KEYS = ALL_PERMISSION_KEYS.filter((key) => !isCriticalPermission(key))

export type UserWithPermissions = {
  id: string
  name: string
  username: string
  email: string | null
  role: UserRole
  isOwner: boolean
  isActive: boolean
  createdAt: Date
} & PermissionState

function canManageUsers(currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  if (currentUser.isOwner) return true
  return hasPermission(currentUser, "canManageUsers", { allowAdminBypass: false })
}

async function assertCanManageUsers(currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  if (currentUser.isOwner) return
  await ensurePermission(currentUser, "canManageUsers", {
    allowAdminBypass: false,
    message: "No tienes permisos para gestionar usuarios",
    resourceType: "User",
  })
}

function assertNoCriticalPermissionMutation(
  currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  permissions?: PartialPermissionState
) {
  if (!permissions || currentUser.isOwner) return

  for (const key of CRITICAL_PERMISSION_KEYS) {
    if (permissions[key] !== undefined) {
      throw new Error("Solo el owner puede modificar permisos criticos")
    }
  }
}

function assertNoCriticalPermissionGrantForDelegatedManager(
  currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  permissions: PermissionState
) {
  if (currentUser.isOwner) return

  for (const key of CRITICAL_PERMISSION_KEYS) {
    if (permissions[key]) {
      throw new Error("Solo el owner puede asignar permisos criticos")
    }
  }
}

export async function listAccountUsers(): Promise<UserWithPermissions[]> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new Error("No autenticado")
  }
  const canListUsers = canManageUsers(currentUser) || hasPermission(currentUser, "canViewAuditLogs", { allowAdminBypass: false })
  if (!canListUsers) {
    await logUnauthorizedAccess(currentUser, "canManageUsers", {
      resourceType: "User",
      details: { reason: "list_users" },
    })
    throw new Error("No tienes permisos para ver usuarios")
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
      createdAt: true,
      ...USER_PERMISSION_SELECT,
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
  permissions: PermissionState
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new Error("No autenticado")
  }

  await assertCanManageUsers(currentUser)
  assertNoCriticalPermissionGrantForDelegatedManager(currentUser, data.permissions)

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

  if (data.password.length < 4) {
    throw new Error("La contraseña debe tener al menos 4 caracteres")
  }

  const normalizedEmail = data.email ? sanitizeEmail(data.email) : null
  if (data.email && !normalizedEmail) {
    throw new Error("Email invalido")
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
    permissions?: PartialPermissionState
  }
) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new Error("No autenticado")
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user || user.accountId !== currentUser.accountId) {
    throw new Error("Usuario no encontrado")
  }

  const canManage = canManageUsers(currentUser)
  const isSelf = currentUser.id === userId

  if (!canManage && !isSelf) {
    throw new Error("No tienes permisos para editar este usuario")
  }

  if (user.isOwner && !currentUser.isOwner) {
    throw new Error("Solo el owner puede editar la cuenta owner")
  }

  if (!canManage && (data.role !== undefined || data.isActive !== undefined || data.permissions !== undefined)) {
    throw new Error("No tienes permisos para cambiar rol, estado o permisos")
  }

  assertNoCriticalPermissionMutation(currentUser, data.permissions)

  if (user.isOwner && data.isActive === false) {
    throw new Error("No se puede desactivar al dueño de la cuenta")
  }

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
    const sanitizedEmail = data.email ? sanitizeEmail(data.email) : null
    if (data.email && !sanitizedEmail) {
      throw new Error("Email invalido")
    }

    updateData.email = sanitizedEmail
    if (sanitizedEmail !== user.email) changes.email = sanitizedEmail
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

  await assertCanManageUsers(currentUser)

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user || user.accountId !== currentUser.accountId) {
    throw new Error("Usuario no encontrado")
  }

  if (user.isOwner && !currentUser.isOwner) {
    throw new Error("Solo el owner puede eliminar la cuenta owner")
  }

  if (user.isOwner) {
    throw new Error("No se puede eliminar al dueño de la cuenta")
  }

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

  await assertCanManageUsers(currentUser)

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user || user.accountId !== currentUser.accountId) {
    throw new Error("Usuario no encontrado")
  }

  if (user.isOwner && !currentUser.isOwner) {
    throw new Error("Solo el owner puede modificar permisos del owner")
  }

  const keysToUpdate = currentUser.isOwner ? ALL_PERMISSION_KEYS : NON_CRITICAL_PERMISSION_KEYS
  const data = keysToUpdate.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = value
    return acc
  }, {})

  await prisma.user.update({
    where: { id: userId },
    data,
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
      scope: currentUser.isOwner ? "all" : "non_critical",
    },
  })

  revalidatePath("/settings")
}
