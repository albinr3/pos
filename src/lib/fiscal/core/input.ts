export class UnsupportedFiscalInputError extends Error {
  readonly code = "FISCAL_NOT_AVAILABLE"
  constructor() {
    super("La preparación de documentos fiscales todavía no está disponible.")
  }
}

export function hasFiscalInput(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false
  const fields = input as Record<string, unknown>
  // No ignorar el bloque fiscal: una venta ordinaria exitosa no equivale a un e-CF.
  return ["fiscal", "fiscalDocument", "fiscalDocumentType", "fiscalType", "fiscalPolicyVersion", "eNcf", "encf"].some(key => Object.hasOwn(fields, key)) ||
    [fields.type, fields.documentType].some(value => typeof value === "string" && /^E\d{2}$/i.test(value.trim()))
}

export function assertNoFiscalInput(input: unknown) {
  if (hasFiscalInput(input)) throw new UnsupportedFiscalInputError()
}
