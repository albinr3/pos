import { Decimal } from "@prisma/client/runtime/library"

/** Datos de la copia original; los importes son centavos y las cantidades son decimales exactos. */
export type CreditOriginalLine = { position: number; quantity: string; grossCents: number }
export type CreditUse = { originalLine: number; quantity: string; physicalQuantity: string; amountCents: number }
export type CreditCapacity = { originalLine: number; availableQuantity: string; availableCents: number }

export class CreditCapacityError extends Error {
  constructor(message: string, public field = "lines") { super(message); this.name = "CreditCapacityError" }
}

const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP })
function quantity(value: string, field: string, zero = false) {
  if (typeof value !== "string" || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new CreditCapacityError("La cantidad debe tener como máximo dos decimales", field)
  const result = new D(value)
  if (zero ? result.lt(0) : result.lte(0)) throw new CreditCapacityError("La cantidad indicada no es válida", field)
  return result
}
function money(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new CreditCapacityError("El importe en centavos no es válido", field)
  return value
}

/** Concilia por línea, considerando tanto notas preparadas como reservas validadas. */
export function creditCapacity(originals: CreditOriginalLine[], uses: CreditUse[]): CreditCapacity[] {
  const positions = new Set<number>()
  const result = originals.map((line) => {
    if (!Number.isSafeInteger(line.position) || line.position < 1 || positions.has(line.position)) throw new CreditCapacityError("La copia contiene líneas duplicadas o inválidas", "reference")
    positions.add(line.position)
    const originalQuantity = quantity(line.quantity, "reference.lines.quantity")
    const originalCents = money(line.grossCents, "reference.lines.gross")
    let consumedQuantity = new D(0), consumedCents = 0
    for (const use of uses.filter(item => item.originalLine === line.position)) {
      const base = quantity(use.quantity, "lines.quantity")
      const physical = quantity(use.physicalQuantity, "lines.physicalQuantity", true)
      if (physical.gt(base)) throw new CreditCapacityError("La cantidad física supera la cantidad de la línea")
      consumedQuantity = consumedQuantity.plus(physical)
      consumedCents += money(use.amountCents, "lines.amountCents")
      if (!Number.isSafeInteger(consumedCents)) throw new CreditCapacityError("La suma de ajustes es inválida")
    }
    // El descuento financiero reduce el importe, pero nunca consume unidades devueltas.
    if (consumedQuantity.gt(originalQuantity) || consumedCents > originalCents) throw new CreditCapacityError("Los ajustes previos superan la copia original", "reference")
    return { originalLine: line.position, availableQuantity: originalQuantity.minus(consumedQuantity).toFixed(2), availableCents: originalCents - consumedCents }
  })
  if (uses.some(use => !positions.has(use.originalLine))) throw new CreditCapacityError("Un ajuste previo apunta a una línea inexistente", "reference")
  return result
}

/** Valida una propuesta completa sobre la capacidad ya reservada o aplicada. */
export function validateCreditUses(originals: CreditOriginalLine[], previous: CreditUse[], proposed: CreditUse[], modificationCode: string): CreditCapacity[] {
  if (!["1", "2", "3"].includes(modificationCode)) throw new CreditCapacityError("Código de modificación no admitido", "reference.modificationCode")
  if (!proposed.length) throw new CreditCapacityError("Indica al menos una línea")
  const capacity = creditCapacity(originals, previous)
  const seen = new Set<number>()
  let total = 0
  for (const use of proposed) {
    if (seen.has(use.originalLine)) throw new CreditCapacityError("No repitas una línea original")
    seen.add(use.originalLine)
    const original = originals.find(item => item.position === use.originalLine)
    const available = capacity.find(item => item.originalLine === use.originalLine)
    if (!original || !available) throw new CreditCapacityError("La línea original no existe")
    const declared = quantity(use.quantity, "lines.quantity"), physical = quantity(use.physicalQuantity, "lines.physicalQuantity", true)
    const availableQty = quantity(available.availableQuantity, "availableQuantity", true)
    const originalQty = quantity(original.quantity, "reference.lines.quantity")
    const cents = money(use.amountCents, "lines.amountCents")
    if (physical.gt(declared) || physical.gt(availableQty) || declared.gt(originalQty)) throw new CreditCapacityError("La cantidad supera la disponibilidad")
    const proportional = new D(original.grossCents).mul(declared).div(originalQty).toDecimalPlaces(0, D.ROUND_HALF_UP)
    // La última devolución física absorbe el redondeo acumulado, siempre dentro del saldo reservado.
    const lastPhysical = physical.gt(0) && physical.eq(availableQty) && physical.eq(declared)
    if (cents > available.availableCents || (!lastPhysical && new D(cents).gt(proportional))) throw new CreditCapacityError("El importe supera la disponibilidad de la línea")
    if (physical.gt(0)) {
      // Repartir el importe restante evita devolver dos veces una reducción financiera anterior.
      const physicalLimit = new D(available.availableCents).mul(physical).div(availableQty).toDecimalPlaces(0, D.ROUND_HALF_UP)
      if (new D(cents).gt(physicalLimit)) throw new CreditCapacityError("El importe físico supera la parte restante proporcional")
    }
    total += cents
    if (!Number.isSafeInteger(total)) throw new CreditCapacityError("El importe total es inválido")
  }
  const remainder = capacity.reduce((sum, item) => sum + item.availableCents, 0)
  if (!Number.isSafeInteger(remainder)) throw new CreditCapacityError("El importe original es inválido", "reference")
  if (modificationCode === "2" && (total !== 0 || proposed.some(item => new D(item.physicalQuantity).gt(0)))) throw new CreditCapacityError("La corrección de texto no mueve dinero ni productos")
  if (modificationCode !== "2" && total <= 0) throw new CreditCapacityError("La nota debe tener un importe positivo")
  if (modificationCode === "1" && total !== remainder) throw new CreditCapacityError("La cancelación debe igualar el importe fiscal restante")
  return creditCapacity(originals, [...previous, ...proposed])
}
