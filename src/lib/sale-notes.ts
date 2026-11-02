export const SALE_NOTES_MAX_LENGTH = 1000

export class SaleNotesValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SaleNotesValidationError"
  }
}

export function normalizeSaleNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") {
    throw new SaleNotesValidationError("La nota de la venta debe ser texto.")
  }
  // Mismo límite que el textarea: rechazar antes de guardar, sin truncar notas de la API u offline.
  if (value.length > SALE_NOTES_MAX_LENGTH) {
    throw new SaleNotesValidationError(`La nota de la venta no puede superar ${SALE_NOTES_MAX_LENGTH} caracteres.`)
  }
  return value.trim() || null
}
