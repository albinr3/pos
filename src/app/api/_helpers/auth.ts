import { NextRequest } from "next/server"
import { getCurrentUser, getClerkUserIdFromToken, getSubUserSession } from "@/lib/auth"

/**
 * Helper para obtener el usuario actual desde un request
 * Lee el token JWT del header X-SubUser-Token (para móvil) o de cookies (para web)
 * Para móvil, también verifica el token de Clerk desde Authorization o X-Clerk-Authorization
 */
export async function getCurrentUserFromRequest(request: NextRequest) {
  const subUserToken = request.headers.get("X-SubUser-Token")
  
  // Si hay token de subusuario pero no hay sesión de Clerk activa,
  // intentar obtener el token de Clerk desde los headers
  let authHeader = 
    request.headers.get("X-Clerk-Authorization") || 
    request.headers.get("x-clerk-authorization") ||
    request.headers.get("Authorization") || 
    request.headers.get("authorization")
  
  // Si hay authHeader, verificar el clerkUserId
  if (authHeader && subUserToken) {
    const clerkUserId = await getClerkUserIdFromToken(authHeader)
    if (clerkUserId) {
      // Validar que el subUserToken corresponde a una cuenta válida
      const session = await getSubUserSession(subUserToken)
      if (!session) {
        return null
      }
      
      // Obtener el usuario con la sesión del subusuario
      // La función getCurrentUser internamente valida que el account corresponda
      const { prisma } = await import("@/lib/db")
      const account = await prisma.account.findUnique({
        where: { clerkUserId }
      })
      
      if (!account || account.id !== session.accountId) {
        return null
      }
      
      // Obtener el usuario completo
      const user = await prisma.user.findUnique({
        where: { id: session.userId }
      })
      
      if (!user || !user.isActive || user.accountId !== account.id) {
        return null
      }
      
      return {
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
    }
  }
  
  // Si no hay headers de Clerk, usar el método normal (para web)
  return await getCurrentUser(subUserToken)
}
