/**
 * Sistema de logging de errores para producción
 * Los errores se guardan en la base de datos y se pueden ver en el Super Admin
 */

import { prisma } from "@/lib/db"
import type { ErrorSeverity, Prisma } from "@prisma/client"

// Campos sensibles que no deben guardarse
const SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "token",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "creditCard",
  "cvv",
  "ssn",
  "cedula",
]

/**
 * Sanitiza un objeto removiendo campos sensibles
 */
function sanitizeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== "object") return obj
  if (Array.isArray(obj)) return obj.map(sanitizeObject)

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = "[REDACTED]"
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

/**
 * Determina la severidad basándose en el error
 */
function determineSeverity(error: Error, code?: string): ErrorSeverity {
  const message = error.message.toLowerCase()

  // Errores críticos
  if (
    message.includes("database") ||
    message.includes("prisma") ||
    message.includes("connection") ||
    code?.includes("DB_")
  ) {
    return "CRITICAL"
  }

  // Errores altos
  if (
    message.includes("authentication") ||
    message.includes("authorization") ||
    message.includes("payment") ||
    message.includes("billing") ||
    code?.includes("AUTH_") ||
    code?.includes("PAYMENT_")
  ) {
    return "HIGH"
  }

  // Errores medios
  if (
    message.includes("validation") ||
    message.includes("invalid") ||
    message.includes("not found")
  ) {
    return "MEDIUM"
  }

  return "LOW"
}

export interface LogErrorOptions {
  /** Código de error personalizado (ej: "PAYMENT_FAILED") */
  code?: string
  /** Severidad del error */
  severity?: ErrorSeverity
  /** ID de la cuenta afectada */
  accountId?: string
  /** ID del usuario que causó el error */
  userId?: string
  /** Endpoint donde ocurrió el error */
  endpoint?: string
  /** Método HTTP */
  method?: string
  /** Body del request (será sanitizado) */
  requestBody?: unknown
  /** Query parameters */
  queryParams?: Record<string, string>
  /** IP del cliente */
  ipAddress?: string
  /** User agent del cliente */
  userAgent?: string
  /** Metadatos adicionales */
  metadata?: Record<string, unknown>
}

/**
 * Registra un error en la base de datos
 * 
 * @example
 * ```ts
 * try {
 *   await processPayment(data)
 * } catch (error) {
 *   await logError(error as Error, {
 *     code: "PAYMENT_FAILED",
 *     accountId: account.id,
 *     endpoint: "/api/billing/pay",
 *     method: "POST",
 *     requestBody: data,
 *   })
 *   throw error
 * }
 * ```
 */
export async function logError(
  error: Error,
  options: LogErrorOptions = {}
): Promise<string | null> {
  try {
    const severity = options.severity ?? determineSeverity(error, options.code)
    const sanitizedMetadata = options.metadata
      ? (sanitizeObject(options.metadata) as Prisma.InputJsonValue)
      : undefined

    const errorLog = await prisma.errorLog.create({
      data: {
        message: error.message,
        stack: error.stack,
        code: options.code,
        severity,
        accountId: options.accountId,
        userId: options.userId,
        endpoint: options.endpoint,
        method: options.method,
        requestBody: options.requestBody
          ? (sanitizeObject(options.requestBody) as object)
          : undefined,
        queryParams: options.queryParams,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        metadata: sanitizedMetadata,
      },
    })

    // También loguear a consola en desarrollo
    if (process.env.NODE_ENV === "development") {
      console.error(`[ErrorLog ${severity}] ${options.code ?? "UNKNOWN"}:`, error.message)
    }

    return errorLog.id
  } catch (logError) {
    // Si falla el logging, al menos mostrar en consola
    console.error("[ErrorLogger] Failed to log error:", logError)
    console.error("[Original Error]:", error)
    return null
  }
}

/**
 * Wrapper para server actions que captura errores automáticamente
 * 
 * @example
 * ```ts
 * export const createSale = withErrorLogging(
 *   async (data: SaleData) => {
 *     // tu código aquí
 *   },
 *   { endpoint: "/sales/actions", code: "SALE_CREATE" }
 * )
 * ```
 */
export function withErrorLogging<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  defaultOptions: Omit<LogErrorOptions, "requestBody">
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      if (error instanceof Error) {
        await logError(error, {
          ...defaultOptions,
          requestBody: args[0], // El primer argumento suele ser el data
        })
      }
      throw error
    }
  }) as T
}

/**
 * Helper para extraer información del request en API routes
 */
export function getRequestInfo(request: Request): Pick<
  LogErrorOptions,
  "endpoint" | "method" | "ipAddress" | "userAgent" | "queryParams"
> {
  const url = new URL(request.url)
  const queryParams: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    queryParams[key] = value
  })

  return {
    endpoint: url.pathname,
    method: request.method,
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
  }
}

/**
 * Códigos de error comunes para usar en el sistema
 */
export const ErrorCodes = {
  // Auth
  AUTH_FAILED: "AUTH_FAILED",
  AUTH_EXPIRED: "AUTH_EXPIRED",
  AUTH_UNAUTHORIZED: "AUTH_UNAUTHORIZED",
  
  // Billing
  BILLING_PAYMENT_FAILED: "BILLING_PAYMENT_FAILED",
  BILLING_SUBSCRIPTION_ERROR: "BILLING_SUBSCRIPTION_ERROR",
  BILLING_WEBHOOK_ERROR: "BILLING_WEBHOOK_ERROR",
  
  // Database
  DB_CONNECTION_ERROR: "DB_CONNECTION_ERROR",
  DB_QUERY_ERROR: "DB_QUERY_ERROR",
  DB_TRANSACTION_ERROR: "DB_TRANSACTION_ERROR",
  
  // Sales
  SALE_CREATE_ERROR: "SALE_CREATE_ERROR",
  SALE_CANCEL_ERROR: "SALE_CANCEL_ERROR",
  SALE_SYNC_ERROR: "SALE_SYNC_ERROR",
  
  // Inventory
  INVENTORY_UPDATE_ERROR: "INVENTORY_UPDATE_ERROR",
  INVENTORY_NEGATIVE_STOCK: "INVENTORY_NEGATIVE_STOCK",
  
  // External services
  EXTERNAL_OCR_ERROR: "EXTERNAL_OCR_ERROR",
  EXTERNAL_EMAIL_ERROR: "EXTERNAL_EMAIL_ERROR",
  EXTERNAL_WHATSAPP_ERROR: "EXTERNAL_WHATSAPP_ERROR",
  EXTERNAL_UPLOAD_ERROR: "EXTERNAL_UPLOAD_ERROR",
  
  // General
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const
