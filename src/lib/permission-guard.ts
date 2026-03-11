import { logAuditEvent } from "@/lib/audit-log"
import { PERMISSION_LABELS, hasPermission, type PermissionAwareUser, type PermissionKey } from "@/lib/permissions"

type GuardOptions = {
  message?: string
  allowAdminBypass?: boolean
  resourceType?: string
  resourceId?: string
  details?: Record<string, unknown>
}

export async function logUnauthorizedAccess(
  user: PermissionAwareUser,
  permission: PermissionKey,
  options?: Omit<GuardOptions, "message" | "allowAdminBypass">
) {
  if (!user.accountId) return

  await logAuditEvent({
    accountId: user.accountId,
    userId: user.id,
    userEmail: user.email ?? null,
    userUsername: user.username ?? null,
    action: "UNAUTHORIZED_ACCESS",
    resourceType: options?.resourceType ?? "Permission",
    resourceId: options?.resourceId,
    details: {
      permission,
      label: PERMISSION_LABELS[permission],
      ...(options?.details ?? {}),
    },
  })
}

export async function ensurePermission(
  user: PermissionAwareUser | null | undefined,
  permission: PermissionKey,
  options?: GuardOptions
) {
  if (hasPermission(user, permission, { allowAdminBypass: options?.allowAdminBypass })) {
    return
  }

  if (user) {
    await logUnauthorizedAccess(user, permission, {
      resourceType: options?.resourceType,
      resourceId: options?.resourceId,
      details: options?.details,
    })
  }

  throw new Error(options?.message ?? `No tienes permiso para ${PERMISSION_LABELS[permission].toLowerCase()}`)
}

export async function hasPermissionOrLog(
  user: PermissionAwareUser | null | undefined,
  permission: PermissionKey,
  options?: Omit<GuardOptions, "message">
): Promise<boolean> {
  if (hasPermission(user, permission, { allowAdminBypass: options?.allowAdminBypass })) {
    return true
  }

  if (user) {
    await logUnauthorizedAccess(user, permission, {
      resourceType: options?.resourceType,
      resourceId: options?.resourceId,
      details: options?.details,
    })
  }

  return false
}
