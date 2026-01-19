import { UnitType } from "@prisma/client"

// Lista de unidades con sus etiquetas y abreviaciones
export const UNIT_OPTIONS: { value: UnitType; label: string; abbr: string; allowsDecimals: boolean }[] = [
  { value: "UNIDAD", label: "Unidad", abbr: "und", allowsDecimals: false },
  { value: "KG", label: "Kilogramo", abbr: "kg", allowsDecimals: true },
  { value: "LIBRA", label: "Libra", abbr: "lb", allowsDecimals: true },
  { value: "GRAMO", label: "Gramo", abbr: "g", allowsDecimals: true },
  { value: "LITRO", label: "Litro", abbr: "L", allowsDecimals: true },
  { value: "ML", label: "Mililitro", abbr: "ml", allowsDecimals: true },
  { value: "GALON", label: "Galón", abbr: "gal", allowsDecimals: true },
  { value: "METRO", label: "Metro", abbr: "m", allowsDecimals: true },
  { value: "CM", label: "Centímetro", abbr: "cm", allowsDecimals: true },
  { value: "PIE", label: "Pie", abbr: "ft", allowsDecimals: true },
]

// Unidades que NO son "UNIDAD" (para el dropdown de productos con medidas)
export const MEASUREMENT_UNITS = UNIT_OPTIONS.filter((u) => u.value !== "UNIDAD")

/**
 * Obtiene la información de una unidad por su valor
 */
export function getUnitInfo(unit: UnitType) {
  return UNIT_OPTIONS.find((u) => u.value === unit) ?? UNIT_OPTIONS[0]
}

/**
 * Verifica si una unidad permite decimales
 */
export function unitAllowsDecimals(unit: UnitType): boolean {
  return getUnitInfo(unit).allowsDecimals
}

/**
 * Formatea una cantidad con su unidad
 * Ej: formatQty(2.5, "KG") => "2.5 kg"
 * Ej: formatQty(3, "UNIDAD") => "3"
 */
export function formatQty(qty: number | string, unit: UnitType): string {
  const numQty = typeof qty === "string" ? parseFloat(qty) : qty
  const info = getUnitInfo(unit)
  
  if (unit === "UNIDAD") {
    return String(Math.round(numQty))
  }
  
  // Formatear con máximo 2 decimales, sin ceros innecesarios
  const formatted = numQty.toFixed(2).replace(/\.?0+$/, "")
  return `${formatted} ${info.abbr}`
}

/**
 * Formatea una cantidad para mostrar en UI (sin unidad, solo el número)
 */
export function formatQtyNumber(qty: number | string, unit: UnitType): string {
  const numQty = typeof qty === "string" ? parseFloat(qty) : qty
  
  if (unit === "UNIDAD") {
    return String(Math.round(numQty))
  }
  
  // Formatear con máximo 2 decimales, sin ceros innecesarios
  return numQty.toFixed(2).replace(/\.?0+$/, "")
}

/**
 * Parsea una cantidad string a número, respetando si la unidad permite decimales
 */
export function parseQty(value: string, unit: UnitType): number {
  const parsed = parseFloat(value) || 0
  
  if (!unitAllowsDecimals(unit)) {
    return Math.round(parsed)
  }
  
  // Redondear a 2 decimales máximo
  return Math.round(parsed * 100) / 100
}

/**
 * Convierte un Decimal de Prisma a número
 */
export function decimalToNumber(decimal: unknown): number {
  if (typeof decimal === "number") return decimal
  if (typeof decimal === "string") return parseFloat(decimal)
  if (decimal && typeof decimal === "object" && "toNumber" in decimal) {
    return (decimal as { toNumber: () => number }).toNumber()
  }
  return 0
}
