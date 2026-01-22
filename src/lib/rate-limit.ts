/**
 * Sistema de Rate Limiting simple en memoria
 * Para producción con múltiples instancias, migrar a Redis
 */

type RateLimitRecord = {
  count: number
  resetTime: number
  blockedUntil?: number
}

const rateLimitMap = new Map<string, RateLimitRecord>()

export interface RateLimitConfig {
  windowMs: number // Ventana de tiempo en milisegundos
  maxRequests: number // Máximo de requests permitidos
  blockDurationMs?: number // Tiempo de bloqueo después de exceder límite
}

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super("Demasiados intentos. Intenta de nuevo más tarde.")
    this.name = "RateLimitError"
  }
}

/**
 * Verifica si una IP/identificador está dentro del límite de rate
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): void {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)

  // Si está bloqueado, lanzar error
  if (record?.blockedUntil && now < record.blockedUntil) {
    const retryAfter = Math.ceil((record.blockedUntil - now) / 1000)
    throw new RateLimitError(retryAfter)
  }

  // Nueva ventana o ventana expirada
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs
    })
    return
  }

  // Incrementar contador
  record.count++

  // Si excede el límite
  if (record.count > config.maxRequests) {
    if (config.blockDurationMs) {
      record.blockedUntil = now + config.blockDurationMs
    }
    const retryAfter = Math.ceil((record.resetTime - now) / 1000)
    throw new RateLimitError(retryAfter)
  }
}

/**
 * Helper para obtener IP del request
 */
export function getClientIdentifier(req: Request): string {
  // Intentar obtener IP real
  const forwarded = req.headers.get("x-forwarded-for")
  const realIp = req.headers.get("x-real-ip")
  
  if (forwarded) {
    return forwarded.split(",")[0].trim()
  }
  
  if (realIp) {
    return realIp
  }
  
  return "unknown"
}

// Limpiar registros viejos cada 5 minutos
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of rateLimitMap.entries()) {
      // Limpiar si la ventana expiró y no está bloqueado
      if (now > record.resetTime && (!record.blockedUntil || now > record.blockedUntil)) {
        rateLimitMap.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}
