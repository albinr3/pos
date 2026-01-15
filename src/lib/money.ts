export function formatRD(cents: number) {
  const value = cents / 100
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    currencyDisplay: "symbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function toCents(input: string | number) {
  if (typeof input === "number") return Math.round(input * 100)
  const normalized = input.replace(/[^0-9.]/g, "")
  const n = Number(normalized || 0)
  return Math.round(n * 100)
}

export function calcItbisIncluded(totalCents: number, itbisRateBp = 1800) {
  // total includes ITBIS. itbisRateBp=1800 means 18.00%
  const rate = itbisRateBp / 10000
  const divisor = 1 + rate
  const subtotalCents = Math.round(totalCents / divisor)
  const itbisCents = totalCents - subtotalCents
  return { subtotalCents, itbisCents, totalCents }
}

export function invoiceCode(series: string, number: number) {
  return `${series}-${number.toString().padStart(5, "0")}`
}
