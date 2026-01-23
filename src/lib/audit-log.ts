import type { Prisma, PrismaClient } from "@prisma/client"

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SALE_CREATED"
  | "SALE_CANCELLED"
  | "SALE_EDITED"
  | "PAYMENT_CREATED"
  | "PAYMENT_CANCELLED"
  | "PRICE_OVERRIDE"
  | "PRODUCT_CREATED"
  | "PRODUCT_EDITED"
  | "PRODUCT_DELETED"
  | "STOCK_ADJUSTED"
  | "PERMISSION_CHANGED"
  | "SETTINGS_CHANGED"
  | "USER_CREATED"
  | "USER_DELETED"
  | "UNAUTHORIZED_ACCESS"

interface AuditLogData {
  accountId: string
  userId?: string
  userEmail?: string | null
  userUsername?: string | null
  action: AuditAction
  resourceType?: string
  resourceId?: string
  details?: Record<string, any>
  ipAddress?: string
  userAgent?: string
}

type AuditClient = Pick<PrismaClient, "user" | "auditLog"> | Prisma.TransactionClient

/**
 * Registra evento de auditoría
 * Por ahora en consola, luego migrar a tabla en DB
 */
export async function logAuditEvent(data: AuditLogData, client?: AuditClient) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: "AUDIT",
      ...data
    }

    // Log estructurado
    console.log(JSON.stringify(logEntry))

    // Guardar en BD si hay accountId válido
    if (!data.accountId || data.accountId === "unknown") {
      return
    }

    const prismaClient = client ?? (await import("@/lib/db")).prisma
    let userEmail = data.userEmail ?? null
    let userUsername = data.userUsername ?? null

    if (data.userId && (!userEmail || !userUsername)) {
      const user = await prismaClient.user.findFirst({
        where: {
          id: data.userId,
          accountId: data.accountId,
        },
        select: {
          email: true,
          username: true,
        },
      })
      if (!userEmail) userEmail = user?.email ?? null
      if (!userUsername) userUsername = user?.username ?? null
    }

    await prismaClient.auditLog.create({
      data: {
        accountId: data.accountId,
        userId: data.userId ?? null,
        userEmail,
        userUsername,
        action: data.action,
        resourceType: data.resourceType ?? null,
        resourceId: data.resourceId ?? null,
        details: data.details === undefined ? undefined : data.details,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      },
    })

    // TODO: En producción, enviar a servicio de logging
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === "P2021") {
      // Tabla no existe aún (migración pendiente); no romper el flujo
      return
    }
    // No fallar la operación principal si el logging falla
    console.error("Error logging audit event:", error)
  }
}

/**
 * Helper para obtener IP y user agent del request
 */
export function getRequestMetadata(req: Request) {
  return {
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0] || 
               req.headers.get("x-real-ip") || 
               "unknown",
    userAgent: req.headers.get("user-agent") || "unknown"
  }
}
