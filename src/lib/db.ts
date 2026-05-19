import { PrismaClient } from "@prisma/client"
import type { Prisma } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { 
  prisma?: PrismaClient
  prismaErrorLogger?: typeof logPrismaError 
}

/**
 * Logs Prisma errors to the ErrorLog table
 * Uses dynamic import to avoid circular dependencies
 */
async function logPrismaError(error: Error, context: {
  operation: string
  model?: string
  args?: unknown
}) {
  try {
    // Dynamic import to avoid circular dependency with error-logger
    const { logError, ErrorCodes } = await import("@/lib/error-logger")
    let fallbackUser:
      | { accountId?: string; userId?: string; userEmail?: string }
      | undefined

    // Determine severity based on error type
    let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "HIGH"
    let code: string = ErrorCodes.DB_QUERY_ERROR
    
    if (error.message.includes("Unique constraint") || error.message.includes("foreign key")) {
      severity = "MEDIUM"
    } else if (error.message.includes("timed out") || error.message.includes("connection")) {
      severity = "CRITICAL"
      code = ErrorCodes.DB_CONNECTION_ERROR
    } else if (error.message.includes("Invalid") || error.message.includes("does not exist")) {
      severity = "CRITICAL" // Schema mismatch is critical
      code = ErrorCodes.DB_QUERY_ERROR
    }

    try {
      const { getCurrentUser } = await import("@/lib/auth")
      const user = await getCurrentUser()
      if (user) {
        fallbackUser = {
          accountId: user.accountId,
          userId: user.id,
          userEmail: user.email ?? undefined,
        }
      }
    } catch {
      // Ignore auth resolution errors in logger fallback.
    }

    const errorCode = getPrismaErrorCode(error)
    const isTransactionCallback = typeof context.args === "function"
    
    await logError(error, {
      code,
      severity,
      accountId: fallbackUser?.accountId,
      userId: fallbackUser?.userId,
      userEmail: fallbackUser?.userEmail,
      endpoint: context.operation,
      metadata: {
        model: context.model,
        operation: context.operation,
        prismaError: true,
        errorName: error.name,
        prismaCode: errorCode,
        isTransactionCallback,
        // Don't log full args as they may contain sensitive data
        hasArgs: !!context.args,
      },
    })
  } catch (logErr) {
    // If logging fails, at least log to console
    console.error("[Prisma Error Logger] Failed to log error:", logErr)
    console.error("[Original Prisma Error]:", error)
  }
}

function isPrismaRuntimeError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false
  const name = error.name || ""
  // Prisma runtime errors usually use names like:
  // PrismaClientKnownRequestError, PrismaClientValidationError, etc.
  return name.startsWith("PrismaClient")
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const candidate = (error as { code?: unknown }).code
  return typeof candidate === "string" ? candidate : undefined
}

function isExpectedBusinessErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("ya está pagada") ||
    normalized.includes("ya esta pagada") ||
    normalized.includes("no autenticado") ||
    normalized.includes("no tienes permiso") ||
    normalized.includes("no se puede editar una venta") ||
    normalized.includes("no se puede cancelar")
  )
}

function shouldAutoLogPrismaError(
  error: unknown,
  context: { operation: string; args?: unknown }
): error is Error {
  if (!isPrismaRuntimeError(error)) return false
  if (isExpectedBusinessErrorMessage(error.message)) return false

  // In interactive transactions, app-level throws can be wrapped by Prisma
  // without a Prisma error code. Skip those to avoid false DB alarms.
  if (context.operation === "prisma.$transaction" && typeof context.args === "function") {
    const prismaCode = getPrismaErrorCode(error)
    if (!prismaCode) return false
  }

  return true
}

// Store the logger globally to reuse
if (!globalForPrisma.prismaErrorLogger) {
  globalForPrisma.prismaErrorLogger = logPrismaError
}

// Función para crear Prisma Client de forma lazy
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

// Getter que solo inicializa Prisma cuando se accede
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  return globalForPrisma.prisma
}

// Solo para utilidades internas que necesiten saltarse el Proxy de `prisma`.
export function getRawPrismaClient(): PrismaClient {
  return getPrismaClient()
}

/**
 * Wraps a Prisma model/operation to automatically log errors
 */
function wrapPrismaModel(model: any, modelName: string): any {
  return new Proxy(model, {
    get(target, prop: string) {
      const value = target[prop]
      
      // If it's a function (like findMany, create, etc.), wrap it
      if (typeof value === "function") {
        return async (...args: unknown[]) => {
          try {
            return await value.apply(target, args)
          } catch (error) {
            if (modelName === "errorLog") {
              throw error
            }

            // Log the error asynchronously (don't block the throw)
            if (shouldAutoLogPrismaError(error, { operation: `${modelName}.${prop}`, args: args[0] }) && globalForPrisma.prismaErrorLogger) {
              // Don't await - log in background
              globalForPrisma.prismaErrorLogger(error, {
                operation: `${modelName}.${prop}`,
                model: modelName,
                args: args[0], // First arg is usually the query params
              }).catch(() => {
                // Silently fail if logging fails
              })
            }
            
            // Always re-throw the original error
            throw error
          }
        }
      }
      
      return value
    },
  })
}

// Exportar un proxy que solo accede a Prisma cuando se usa
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string) {
    const client = getPrismaClient()
    const value = client[prop as keyof PrismaClient]
    
    // Wrap Prisma models (like prisma.product, prisma.sale, etc.)
    if (value && typeof value === "object" && prop !== "$connect" && prop !== "$disconnect") {
      return wrapPrismaModel(value, prop)
    }
    
    // Si es una función (como $transaction, $executeRaw, etc.), también la envolvemos
    if (typeof value === "function") {
      // For $transaction and other special methods, wrap them too
      if (prop === "$transaction" || prop === "$executeRaw" || prop === "$queryRaw") {
        return async (...args: unknown[]) => {
          try {
            return await (value as Function).apply(client, args)
          } catch (error) {
            if (shouldAutoLogPrismaError(error, { operation: `prisma.${prop}`, args: args[0] }) && globalForPrisma.prismaErrorLogger) {
              globalForPrisma.prismaErrorLogger(error, {
                operation: `prisma.${prop}`,
                args: args[0],
              }).catch(() => {})
            }
            throw error
          }
        }
      }
      
      return value.bind(client)
    }
    
    return value
  },
})
