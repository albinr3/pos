export function startOfDay(d: Date = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfDay(d: Date = new Date()) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function parseDateParam(value?: string | null) {
  if (!value) return null
  // Parsear la fecha como fecha local (no UTC)
  // Formato esperado: YYYY-MM-DD
  const parts = value.split("-")
  if (parts.length !== 3) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1 // Los meses en JS son 0-indexed
  const day = parseInt(parts[2], 10)
  const d = new Date(year, month, day)
  return Number.isNaN(d.getTime()) ? null : d
}
