import { calcDiscountedLineTotalsByTaxMode, calcPercentAmountCents, type DiscountedLineInput } from "@/lib/money"

export type ExemptSalePriceInput = {
  lines: DiscountedLineInput[]
  priceIncludesItbis: boolean
  discountPercentBp: number
  shippingCents: number
  applyLegalTip: boolean
}

/** Vista previa monetaria para E44/E46, a partir de precios comerciales originales. */
export function calculateExemptSalePrices(input: ExemptSalePriceInput) {
  if (!Number.isSafeInteger(input.shippingCents) || input.shippingCents < 0 || !Number.isSafeInteger(input.discountPercentBp) || input.discountPercentBp < 0 || input.discountPercentBp > 10000 || !input.lines.length || input.lines.length > 100) {
    throw new Error("Los importes de la venta son inválidos")
  }
  const lines = input.lines.map(line => {
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents <= 0 || !Number.isFinite(line.qty) || line.qty <= 0 || Math.abs(line.qty * 100 - Math.round(line.qty * 100)) > 1e-8 || ![0, 1600, 1800].includes(line.itbisRateBp ?? 1800)) {
      throw new Error("Los importes de la venta son inválidos")
    }
    // Calcular desde el precio original evita retirar ITBIS otra vez al cambiar E44/E46.
    const original = calcDiscountedLineTotalsByTaxMode(line.unitPriceCents, line.qty, line.itbisRateBp ?? 1800, input.priceIncludesItbis, input.discountPercentBp)
    return { ...original, exemptTotalCents: original.subtotalCents }
  })
  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0)
  const originalItbisCents = lines.reduce((sum, line) => sum + line.itbisCents, 0)
  const legalTipCents = input.applyLegalTip ? calcPercentAmountCents(subtotalCents, 1000) : 0
  const totalCents = subtotalCents + input.shippingCents + legalTipCents
  if (![subtotalCents, originalItbisCents, legalTipCents, totalCents].every(Number.isSafeInteger)) {
    throw new Error("Los importes de la venta exceden el límite admitido")
  }
  return { lines, subtotalCents, originalItbisCents, itbisCents: 0, shippingCents: input.shippingCents, legalTipCents, totalCents }
}
