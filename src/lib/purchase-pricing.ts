const DEFAULT_ITBIS_RATE_BP = 1800
const DEFAULT_MARGIN_BP = 3000
const MAX_DISCOUNT_BP = 10000
const MAX_MARGIN_BP = 50000

function toSafeInt(value: number, fallback = 0) {
  if (!Number.isFinite(value)) return fallback
  return Math.round(value)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeItbisRateBp(rateBp: number | null | undefined) {
  return clamp(toSafeInt(rateBp ?? DEFAULT_ITBIS_RATE_BP, DEFAULT_ITBIS_RATE_BP), 0, 100000)
}

export function normalizeDiscountBp(discountBp: number | null | undefined) {
  return clamp(toSafeInt(discountBp ?? 0, 0), 0, MAX_DISCOUNT_BP)
}

export function normalizeMarginBp(marginBp: number | null | undefined) {
  return clamp(toSafeInt(marginBp ?? DEFAULT_MARGIN_BP, DEFAULT_MARGIN_BP), 0, MAX_MARGIN_BP)
}

export type PurchaseCostBreakdown = {
  unitCostCents: number
  discountPercentBp: number
  purchaseIncludesItbis: boolean
  purchaseItbisRateBp: number
  discountedCostCents: number
  netCostCents: number
  purchaseNoItbisCents: number
}

export function computePurchaseCostBreakdown(input: {
  unitCostCents: number
  discountPercentBp?: number | null
  purchaseIncludesItbis: boolean
  purchaseItbisRateBp?: number | null
}): PurchaseCostBreakdown {
  const unitCostCents = Math.max(0, toSafeInt(input.unitCostCents, 0))
  const discountPercentBp = normalizeDiscountBp(input.discountPercentBp)
  const purchaseItbisRateBp = normalizeItbisRateBp(input.purchaseItbisRateBp)
  const purchaseIncludesItbis = Boolean(input.purchaseIncludesItbis)

  const discountRate = discountPercentBp / 10000
  const discountedCostCents = Math.round(unitCostCents * (1 - discountRate))

  if (!purchaseIncludesItbis || purchaseItbisRateBp === 0) {
    return {
      unitCostCents,
      discountPercentBp,
      purchaseIncludesItbis,
      purchaseItbisRateBp,
      discountedCostCents,
      netCostCents: discountedCostCents,
      purchaseNoItbisCents: discountedCostCents,
    }
  }

  const rate = purchaseItbisRateBp / 10000
  const netCostCents = Math.round(discountedCostCents * (1 + rate))
  const purchaseNoItbisCents = Math.round(netCostCents / (1 + rate))

  return {
    unitCostCents,
    discountPercentBp,
    purchaseIncludesItbis,
    purchaseItbisRateBp,
    discountedCostCents,
    netCostCents,
    purchaseNoItbisCents,
  }
}

export type SalePriceResult = {
  saleMarginBp: number
  saleNoItbisCents: number
  salePriceCents: number
  appliedItbisRateBp: number
}

export function computeSalePriceFromMargin(input: {
  purchaseNoItbisCents: number
  saleMarginBp?: number | null
  saleItbisRateBp?: number | null
  salePricesIncludeItbis?: boolean
}): SalePriceResult {
  const purchaseNoItbisCents = Math.max(0, toSafeInt(input.purchaseNoItbisCents, 0))
  const saleMarginBp = normalizeMarginBp(input.saleMarginBp)
  const saleItbisRateBp = normalizeItbisRateBp(input.saleItbisRateBp)
  const appliedItbisRateBp = saleItbisRateBp > 0 ? saleItbisRateBp : 0
  const salePricesIncludeItbis = input.salePricesIncludeItbis ?? true

  const saleNoItbisCents = Math.round(purchaseNoItbisCents * (1 + saleMarginBp / 10000))
  const salePriceCents = salePricesIncludeItbis && appliedItbisRateBp > 0
    ? Math.round(saleNoItbisCents * (1 + appliedItbisRateBp / 10000))
    : saleNoItbisCents

  return {
    saleMarginBp,
    saleNoItbisCents,
    salePriceCents,
    appliedItbisRateBp,
  }
}

export function computeMarginFromSalePrice(input: {
  purchaseNoItbisCents: number
  salePriceCents: number
  saleItbisRateBp?: number | null
  salePricesIncludeItbis?: boolean
}): SalePriceResult {
  const purchaseNoItbisCents = Math.max(0, toSafeInt(input.purchaseNoItbisCents, 0))
  const salePriceCents = Math.max(0, toSafeInt(input.salePriceCents, 0))
  const saleItbisRateBp = normalizeItbisRateBp(input.saleItbisRateBp)
  const appliedItbisRateBp = saleItbisRateBp > 0 ? saleItbisRateBp : 0
  const salePricesIncludeItbis = input.salePricesIncludeItbis ?? true

  const saleNoItbisCents = salePricesIncludeItbis && appliedItbisRateBp > 0
    ? Math.round(salePriceCents / (1 + appliedItbisRateBp / 10000))
    : salePriceCents

  const rawMarginBp = purchaseNoItbisCents > 0
    ? ((saleNoItbisCents / purchaseNoItbisCents) - 1) * 10000
    : 0

  const saleMarginBp = normalizeMarginBp(rawMarginBp)

  return {
    saleMarginBp,
    saleNoItbisCents,
    salePriceCents,
    appliedItbisRateBp,
  }
}

export function resolvePurchaseSalePricing(input: {
  unitCostCents: number
  discountPercentBp?: number | null
  purchaseIncludesItbis: boolean
  purchaseItbisRateBp?: number | null
  productItbisRateBp?: number | null
  defaultSaleMarginBp?: number | null
  saleMarginBp?: number | null
  salePriceCents?: number | null
  salePricesIncludeItbis?: boolean
}) {
  const purchase = computePurchaseCostBreakdown({
    unitCostCents: input.unitCostCents,
    discountPercentBp: input.discountPercentBp,
    purchaseIncludesItbis: input.purchaseIncludesItbis,
    purchaseItbisRateBp: input.purchaseItbisRateBp,
  })

  const saleItbisRateBp = normalizeItbisRateBp(input.productItbisRateBp)
  const effectiveSaleItbisRateBp = saleItbisRateBp > 0 ? saleItbisRateBp : 0

  if (input.salePriceCents !== null && input.salePriceCents !== undefined && Number.isFinite(input.salePriceCents)) {
    const sale = computeMarginFromSalePrice({
      purchaseNoItbisCents: purchase.purchaseNoItbisCents,
      salePriceCents: input.salePriceCents,
      saleItbisRateBp: effectiveSaleItbisRateBp,
      salePricesIncludeItbis: input.salePricesIncludeItbis,
    })
    return {
      ...purchase,
      ...sale,
    }
  }

  const sale = computeSalePriceFromMargin({
    purchaseNoItbisCents: purchase.purchaseNoItbisCents,
    saleMarginBp: input.saleMarginBp ?? input.defaultSaleMarginBp ?? DEFAULT_MARGIN_BP,
    saleItbisRateBp: effectiveSaleItbisRateBp,
    salePricesIncludeItbis: input.salePricesIncludeItbis,
  })

  return {
    ...purchase,
    ...sale,
  }
}
