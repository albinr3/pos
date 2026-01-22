import validator from "validator"

/**
 * Sanitiza strings removiendo caracteres peligrosos
 */
export function sanitizeString(input: string): string {
  if (!input) return ""
  return validator.escape(input.trim())
}

/**
 * Sanitiza y valida email
 */
export function sanitizeEmail(email: string): string | null {
  if (!email) return null
  const normalized = validator.normalizeEmail(email)
  if (!normalized || !validator.isEmail(normalized)) {
    return null
  }
  return normalized
}

/**
 * Sanitiza números de teléfono (solo números, +, espacios, guiones, paréntesis)
 */
export function sanitizePhone(phone: string): string {
  if (!phone) return ""
  return phone.replace(/[^0-9+\s()-]/g, "").trim()
}

/**
 * Sanitiza números decimales (solo números y punto)
 */
export function sanitizeDecimal(value: string): string {
  if (!value) return "0"
  return value.replace(/[^0-9.]/g, "")
}

/**
 * Sanitiza cédula (solo números y guiones)
 */
export function sanitizeCedula(cedula: string): string {
  if (!cedula) return ""
  return cedula.replace(/[^0-9-]/g, "").trim()
}

/**
 * Sanitiza SKU/códigos (solo alfanuméricos y guiones)
 */
export function sanitizeCode(code: string): string {
  if (!code) return ""
  return code.replace(/[^a-zA-Z0-9-_]/g, "").trim()
}

/**
 * Valida longitud de string
 */
export function validateLength(str: string, min: number, max: number): boolean {
  const length = str.length
  return length >= min && length <= max
}
