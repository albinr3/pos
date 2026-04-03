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

export function calcItbisExcluded(subtotalCents: number, itbisRateBp = 1800) {
  // subtotal does not include ITBIS. itbisRateBp=1800 means 18.00%
  const rate = itbisRateBp / 10000
  const itbisCents = Math.round(subtotalCents * rate)
  const totalCents = subtotalCents + itbisCents
  return { subtotalCents, itbisCents, totalCents }
}

export function calcLineTotalsByTaxMode(
  unitPriceCents: number,
  qty: number,
  itbisRateBp = 1800,
  priceIncludesItbis = true
) {
  const lineBaseCents = Math.round(unitPriceCents * qty)
  if (priceIncludesItbis) {
    return calcItbisIncluded(lineBaseCents, itbisRateBp)
  }
  return calcItbisExcluded(lineBaseCents, itbisRateBp)
}

const MIN_DISCOUNT_BP = 0
const MAX_DISCOUNT_BP = 10000

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeDiscountPercentBp(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0
  return clamp(Math.round(value ?? 0), MIN_DISCOUNT_BP, MAX_DISCOUNT_BP)
}

export type DiscountedLineInput = {
  unitPriceCents: number
  qty: number
  itbisRateBp?: number | null
}

export type DiscountedLineTotals = {
  subtotalBeforeDiscountCents: number
  discountSubtotalCents: number
  subtotalCents: number
  itbisCents: number
  totalBeforeDiscountCents: number
  discountTotalCents: number
  totalCents: number
}

export type DiscountedDocumentTotals = {
  subtotalBeforeDiscountCents: number
  discountSubtotalCents: number
  subtotalCents: number
  itbisCents: number
  itemsTotalBeforeDiscountCents: number
  discountTotalCents: number
  itemsTotalCents: number
}

export function calcDiscountedLineTotalsByTaxMode(
  unitPriceCents: number,
  qty: number,
  itbisRateBp = 1800,
  priceIncludesItbis = true,
  discountPercentBp = 0
): DiscountedLineTotals {
  const normalizedDiscountBp = normalizeDiscountPercentBp(discountPercentBp)
  const lineBase = calcLineTotalsByTaxMode(unitPriceCents, qty, itbisRateBp, priceIncludesItbis)
  const subtotalBeforeDiscountCents = lineBase.subtotalCents
  const totalBeforeDiscountCents = lineBase.totalCents
  const discountFactorBp = 10000 - normalizedDiscountBp

  let subtotalCents = subtotalBeforeDiscountCents
  let itbisCents = lineBase.itbisCents
  let totalCents = totalBeforeDiscountCents

  if (normalizedDiscountBp > 0) {
    if (priceIncludesItbis) {
      // En precios con ITBIS incluido: descontar sobre el total bruto y luego
      // separar subtotal/ITBIS. Esto evita casos como 50.00 - 10% = 44.99.
      totalCents = Math.round((totalBeforeDiscountCents * discountFactorBp) / 10000)
      const discountedSplit = calcItbisIncluded(totalCents, itbisRateBp)
      subtotalCents = discountedSplit.subtotalCents
      itbisCents = discountedSplit.itbisCents
    } else {
      subtotalCents = Math.round((subtotalBeforeDiscountCents * discountFactorBp) / 10000)
      itbisCents = Math.round((subtotalCents * itbisRateBp) / 10000)
      totalCents = subtotalCents + itbisCents
    }
  }

  const discountSubtotalCents = Math.max(0, subtotalBeforeDiscountCents - subtotalCents)
  const discountTotalCents = Math.max(0, totalBeforeDiscountCents - totalCents)

  return {
    subtotalBeforeDiscountCents,
    discountSubtotalCents,
    subtotalCents,
    itbisCents,
    totalBeforeDiscountCents,
    discountTotalCents,
    totalCents,
  }
}

export function calcDiscountedDocumentTotalsByTaxMode(
  lines: DiscountedLineInput[],
  priceIncludesItbis = true,
  discountPercentBp = 0
): DiscountedDocumentTotals {
  const normalizedDiscountBp = normalizeDiscountPercentBp(discountPercentBp)

  return lines.reduce<DiscountedDocumentTotals>(
    (acc, line) => {
      const lineTotals = calcDiscountedLineTotalsByTaxMode(
        line.unitPriceCents,
        line.qty,
        line.itbisRateBp ?? 1800,
        priceIncludesItbis,
        normalizedDiscountBp
      )
      acc.subtotalBeforeDiscountCents += lineTotals.subtotalBeforeDiscountCents
      acc.discountSubtotalCents += lineTotals.discountSubtotalCents
      acc.subtotalCents += lineTotals.subtotalCents
      acc.itbisCents += lineTotals.itbisCents
      acc.itemsTotalBeforeDiscountCents += lineTotals.totalBeforeDiscountCents
      acc.discountTotalCents += lineTotals.discountTotalCents
      acc.itemsTotalCents += lineTotals.totalCents
      return acc
    },
    {
      subtotalBeforeDiscountCents: 0,
      discountSubtotalCents: 0,
      subtotalCents: 0,
      itbisCents: 0,
      itemsTotalBeforeDiscountCents: 0,
      discountTotalCents: 0,
      itemsTotalCents: 0,
    }
  )
}

export function invoiceCode(series: string, number: number) {
  return `${series}-${number.toString().padStart(5, "0")}`
}
