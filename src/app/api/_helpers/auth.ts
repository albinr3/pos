import { NextRequest } from "next/server"
import { getCurrentUser, getClerkUserIdFromToken, getSubUserSession } from "@/lib/auth"

/**
 * Helper para obtener el usuario actual desde un request
 * Lee el token JWT del header X-SubUser-Token (para móvil) o de cookies (para web)
 * Para móvil, también verifica el token de Clerk desde Authorization o X-Clerk-Authorization
 */
export async function getCurrentUserFromRequest(request: NextRequest) {
  console.log("🔍 [getCurrentUserFromRequest] Iniciando validación de request...")
  
  const subUserToken = request.headers.get("X-SubUser-Token")
  
  // Si hay token de subusuario pero no hay sesión de Clerk activa,
  // intentar obtener el token de Clerk desde los headers
  let authHeader = 
    request.headers.get("X-Clerk-Authorization") || 
    request.headers.get("x-clerk-authorization") ||
    request.headers.get("Authorization") || 
    request.headers.get("authorization")
  
  console.log("🔍 Headers recibidos:", {
    subUserToken: subUserToken ? PRESENTE (...) : "AUSENTE",
    authorization: authHeader ? PRESENTE (...) : "AUSENTE"
  })
  
  // Si hay authHeader, verificar el clerkUserId
  if (authHeader && subUserToken) {
    console.log("🔍 Validando tokens de Clerk y SubUser...")
    const clerkUserId = await getClerkUserIdFromToken(authHeader)
    console.log("🔍 ClerkUserId obtenido:", clerkUserId ? clerkUserId : "NULL")
    
    if (clerkUserId) {
      // Validar que el subUserToken corresponde a una cuenta válida
      const session = await getSubUserSession(subUserToken)
      console.log("🔍 Sesión de subuser:", session ? ccountId: , userId:  : "NULL")
      
      if (session) {
        // Obtener el usuario completo de la base de datos
        const prisma = (await import("@/lib/db")).prisma
        const user = await prisma.user.findFirst({
          where: {
            id: session.userId,
            accountId: session.accountId,
          },
        })
        
        console.log("🔍 Usuario encontrado:", user ? user.username : "NULL")
        
        if (user) {
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
    }
  }
  
  console.log("🔍 Fallback a getCurrentUser con método normal (web)")
  // Si no hay headers de Clerk, usar el método normal (para web)
  return await getCurrentUser(subUserToken)
}
