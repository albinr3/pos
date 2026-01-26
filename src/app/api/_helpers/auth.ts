import { NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * Helper para obtener el usuario actual desde un request
 * Lee el token JWT del header X-SubUser-Token (para móvil) o de cookies (para web)
 */
export async function getCurrentUserFromRequest(request: NextRequest) {
  const subUserToken = request.headers.get("X-SubUser-Token")
  return await getCurrentUser(subUserToken)
}
