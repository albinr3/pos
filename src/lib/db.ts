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
    
    await logError(error, {
      code,
      severity,
      endpoint: context.operation,
      metadata: {
        model: context.model,
        operation: context.operation,
        prismaError: true,
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
            // Log the error asynchronously (don't block the throw)
            if (error instanceof Error && globalForPrisma.prismaErrorLogger) {
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
            if (error instanceof Error && globalForPrisma.prismaErrorLogger) {
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
