import type { PurchaseCostBreakdown } from "@/lib/purchase-pricing"

export function summarizePurchaseReview<T extends { included: boolean; quantity: number; unitPrice: number }>(products: readonly T[], discounts: Record<number, number>, price: (product: T, discountBp: number) => PurchaseCostBreakdown) {
  let subtotalCents = 0, discountCents = 0, totalCents = 0, noItbisCents = 0
  // El descuento usa el índice original: filtrar primero desplazaba los descuentos de las otras filas.
  products.forEach((product, index) => {
    if (!product.included) return
    const pricing = price(product, discounts[index] ?? 0)
    subtotalCents += Math.round(product.unitPrice * product.quantity)
    discountCents += Math.round((pricing.unitCostCents - pricing.discountedCostCents) * product.quantity)
    // Redondear por línea igual que el servicio de compras, antes de sumar el total financiado.
    totalCents += Math.round(pricing.netCostCents * product.quantity)
    noItbisCents += Math.round(pricing.purchaseNoItbisCents * product.quantity)
  })
  return { subtotalCents, discountCents, totalCents, itbisCents: totalCents - noItbisCents }
}
