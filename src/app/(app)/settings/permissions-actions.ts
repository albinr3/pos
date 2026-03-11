"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit-log"
import {
  ALL_PERMISSION_KEYS,
  CRITICAL_PERMISSION_KEYS,
  isCriticalPermission,
  type PermissionKey,
} from "@/lib/permissions"
import { ensurePermission } from "@/lib/permission-guard"

type PartialPermissionState = Partial<Record<PermissionKey, boolean>>

const USER_PERMISSION_SELECT = ALL_PERMISSION_KEYS.reduce<Record<PermissionKey, true>>((acc, key) => {
  acc[key] = true
  return acc
}, {} as Record<PermissionKey, true>)

const NON_CRITICAL_PERMISSION_KEYS = ALL_PERMISSION_KEYS.filter((key) => !isCriticalPermission(key))

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
  permissions: PartialPermissionState
) {
  if (currentUser.isOwner) return

  for (const key of CRITICAL_PERMISSION_KEYS) {
    if (permissions[key] !== undefined) {
      throw new Error("Solo el owner puede modificar permisos criticos")
    }
  }
}

export async function listUsersWithPermissions() {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autenticado")

  await assertCanManageUsers(user)

  const users = await prisma.user.findMany({
    where: { accountId: user.accountId, isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      isOwner: true,
      ...USER_PERMISSION_SELECT,
    },
  })
  return users
}

export async function updateUserPermissions(input: {
  userId: string
} & PartialPermissionState) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  await assertCanManageUsers(currentUser)

  const targetUser = await prisma.user.findFirst({
    where: { accountId: currentUser.accountId, id: input.userId },
  })
  if (!targetUser) throw new Error("Usuario no encontrado")

  if (targetUser.isOwner && !currentUser.isOwner) {
    throw new Error("Solo el owner puede modificar permisos del owner")
  }

  const { userId, ...permissions } = input
  assertNoCriticalPermissionMutation(currentUser, permissions)

  await prisma.user.update({
    where: { id: userId },
    data: permissions,
  })

  const permissionChanges: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(permissions)) {
    if (value === undefined) continue
    const currentValue = targetUser[key as keyof typeof targetUser] as boolean | undefined
    if (currentValue !== value) {
      permissionChanges[key] = value
    }
  }

  if (Object.keys(permissionChanges).length > 0) {
    await logAuditEvent({
      accountId: currentUser.accountId,
      userId: currentUser.id,
      userEmail: currentUser.email ?? null,
      userUsername: currentUser.username ?? null,
      action: "PERMISSION_CHANGED",
      resourceType: "User",
      resourceId: userId,
      details: {
        permissions: permissionChanges,
      },
    })
  }

  revalidatePath("/settings")
}

export async function setAllPermissions(userId: string, value: boolean) {
  const currentUser = await getCurrentUser()
  if (!currentUser) throw new Error("No autenticado")

  await assertCanManageUsers(currentUser)

  const targetUser = await prisma.user.findFirst({
    where: { accountId: currentUser.accountId, id: userId },
  })
  if (!targetUser) throw new Error("Usuario no encontrado")

  if (targetUser.isOwner && !currentUser.isOwner) {
    throw new Error("Solo el owner puede modificar permisos del owner")
  }

  const keysToUpdate = currentUser.isOwner ? ALL_PERMISSION_KEYS : NON_CRITICAL_PERMISSION_KEYS
  const payload = keysToUpdate.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = value
    return acc
  }, {})

  await prisma.user.update({
    where: { id: userId },
    data: payload,
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
