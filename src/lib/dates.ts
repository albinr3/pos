// Zona de negocio fija: UTC-4 (República Dominicana / Caracas)
const BUSINESS_TZ_OFFSET_MINUTES = -4 * 60
const BUSINESS_TZ_OFFSET_MS = BUSINESS_TZ_OFFSET_MINUTES * 60 * 1000

function businessDayStartUtcFromInstant(d: Date) {
  // Convertimos el instante a "hora de negocio", truncamos a 00:00 y devolvemos a UTC.
  const shifted = new Date(d.getTime() + BUSINESS_TZ_OFFSET_MS)
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    0,
    0,
    0,
    0,
  ) - BUSINESS_TZ_OFFSET_MS
}

export function startOfDay(d: Date = new Date()) {
  return new Date(businessDayStartUtcFromInstant(d))
}

export function endOfDay(d: Date = new Date()) {
  const start = businessDayStartUtcFromInstant(d)
  return new Date(start + (24 * 60 * 60 * 1000) - 1)
}

export function parseDateParam(value?: string | null) {
  if (!value) return null

  // Formato esperado: YYYY-MM-DD (calendario de negocio UTC-4).
  const parts = value.split("-")
  if (parts.length === 3) {
    const year = Number.parseInt(parts[0], 10)
    const month = Number.parseInt(parts[1], 10) - 1 // JS month is 0-indexed
    const day = Number.parseInt(parts[2], 10)
    if ([year, month, day].some((x) => Number.isNaN(x))) return null
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - BUSINESS_TZ_OFFSET_MS)
  }

  // Si llega con timestamp/hora explícita, respetar el instante.
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
