import { notFound } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { hasPermission, type PermissionKey } from "@/lib/permissions"

export async function requireModuleAccess(permission: PermissionKey) {
  const user = await getCurrentUser()

  // Mantener el guard server-side evita que una ruta directa ignore el menú oculto.
  if (!user || !hasPermission(user, permission, { allowAdminBypass: false })) {
    notFound()
  }

  return user
}
