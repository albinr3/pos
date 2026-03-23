/**
 * Sistema de logging de errores para producción
 * Los errores se guardan en la base de datos y se pueden ver en el Super Admin
 */

import { prisma } from "@/lib/db"
import type { ErrorSeverity, Prisma } from "@prisma/client"
import { notifyHighOrCriticalError } from "@/lib/super-admin-notifications"

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

// Evita recursión infinita cuando falla Prisma durante el propio proceso de logging.
let isLoggingErrorInternally = false

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

function normalizePathOnly(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return "/"
  if (trimmed.startsWith("/")) return trimmed
  return `/${trimmed}`
}

function extractPathFromUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const value = raw.trim()
  if (!value) return undefined

  if (value.startsWith("/")) {
    return normalizePathOnly(value.split("?")[0]?.split("#")[0] ?? value)
  }

  try {
    const parsed = new URL(value)
    return normalizePathOnly(parsed.pathname || "/")
  } catch {
    return undefined
  }
}

async function inferUrlPathFromServerContext(): Promise<string | undefined> {
  try {
    const { headers } = await import("next/headers")
    const headerStore = await headers()
    const refererPath = extractPathFromUrl(headerStore.get("referer"))
    if (refererPath) return refererPath
  } catch {
    // Contexto sin headers() disponible (p. ej. tareas en background).
  }
  return undefined
}

async function resolveUserContext(options: LogErrorOptions): Promise<{
  userEmail?: string
  userPhone?: string
}> {
  if (options.userEmail || options.userPhone || !options.userId) {
    return {
      userEmail: options.userEmail ?? undefined,
      userPhone: options.userPhone ?? undefined,
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: options.userId },
    select: {
      email: true,
      whatsappNumber: true,
    },
  })

  return {
    userEmail: options.userEmail ?? user?.email ?? undefined,
    userPhone: options.userPhone ?? user?.whatsappNumber ?? undefined,
  }
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
  /** Email del usuario que causó el error */
  userEmail?: string
  /** Telefono del usuario que causó el error (whatsappNumber) */
  userPhone?: string
  /** Endpoint donde ocurrió el error */
  endpoint?: string
  /** Ruta interna donde ocurrió el error (solo path, sin dominio/query) */
  urlPath?: string
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
  if (isLoggingErrorInternally) {
    console.error("[ErrorLogger] Recursive log attempt suppressed:", error)
    return null
  }

  isLoggingErrorInternally = true
  try {
    const severity = options.severity ?? determineSeverity(error, options.code)
    const userContext = await resolveUserContext(options)
    const inferredUrlPath = await inferUrlPathFromServerContext()
    const urlPath =
      extractPathFromUrl(options.urlPath) ??
      inferredUrlPath ??
      extractPathFromUrl(options.endpoint)
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
        userEmail: userContext.userEmail,
        userPhone: userContext.userPhone,
        endpoint: options.endpoint,
        urlPath,
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

    if (severity === "HIGH" || severity === "CRITICAL") {
      await notifyHighOrCriticalError({
        errorLogId: errorLog.id,
        severity,
        code: options.code ?? null,
        message: error.message,
      }).catch((notifyError) => {
        console.error("[ErrorLogger] Failed to create super admin notification:", notifyError)
      })
    }

    // Enviar notificación por correo si no es un error de email
    if (options.code !== ErrorCodes.EXTERNAL_EMAIL_ERROR) {
      try {
        // Importación dinámica para evitar dependencias circulares
        const { sendResendEmail } = await import("@/lib/resend")
        const { renderErrorNotification } = await import("@/lib/resend/templates")

        const { subject, html } = await renderErrorNotification({
          error,
          code: options.code,
          severity,
          accountId: options.accountId,
          userId: options.userId,
          userEmail: userContext.userEmail,
          userPhone: userContext.userPhone,
          endpoint: options.endpoint,
          urlPath,
          method: options.method,
          metadata: options.metadata,
        })

        // Enviar al email de soporte
        // Usamos una cuenta nula o de sistema si no hay accountId para evitar errores si la cuenta no existe/está bloqueada
        await sendResendEmail({
          to: "soporte@movopos.com",
          subject,
          html,
          accountId: options.accountId, // Pasamos el accountId para tracking si existe
        }).catch(err => console.error("[ErrorLogger] Failed to send email notification:", err))

      } catch (emailError) {
        // Silenciosamente fallar si no se puede enviar el correo para no afectar el flujo principal
        console.error("[ErrorLogger] Error preparing email notification:", emailError)
      }
    }

    return errorLog.id
  } catch (logError) {
    // Si falla el logging, al menos mostrar en consola
    console.error("[ErrorLogger] Failed to log error:", logError)
    console.error("[Original Error]:", error)
    return null
  } finally {
    isLoggingErrorInternally = false
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
  "endpoint" | "method" | "ipAddress" | "userAgent" | "queryParams" | "urlPath"
> {
  const url = new URL(request.url)
  const referer = request.headers.get("referer")
  const refererPath = extractPathFromUrl(referer)
  const queryParams: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    queryParams[key] = value
  })

  return {
    endpoint: url.pathname,
    urlPath: refererPath ?? url.pathname,
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
