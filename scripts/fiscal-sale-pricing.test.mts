import { test } from "node:test"
import assert from "node:assert/strict"
// tsx expone los módulos TypeScript del proyecto mediante importación dinámica en .mts.
const { calculateExemptSalePrices } = await import("../src/lib/fiscal/core/sale-pricing")

test("precios con ITBIS incluido conservan la base y muestran el impuesto retirado", () => {
  const input = { lines: [{ unitPriceCents: 11800, qty: 1, itbisRateBp: 1800 }], priceIncludesItbis: true, discountPercentBp: 0, shippingCents: 500, applyLegalTip: true }
  const result = calculateExemptSalePrices(input)
  assert.equal(result.subtotalCents, 10000)
  assert.equal(result.originalItbisCents, 1800)
  assert.equal(result.itbisCents, 0)
  assert.equal(result.legalTipCents, 1000)
  assert.equal(result.totalCents, 11500)
  assert.equal(input.lines[0].unitPriceCents, 11800)
  assert.deepEqual(calculateExemptSalePrices(input), result)
})

test("precios sin impuesto, descuentos y cantidades conservan el redondeo comercial", () => {
  const result = calculateExemptSalePrices({ lines: [{ unitPriceCents: 10000, qty: 2, itbisRateBp: 1800 }, { unitPriceCents: 5000, qty: 1, itbisRateBp: 0 }], priceIncludesItbis: false, discountPercentBp: 1000, shippingCents: 0, applyLegalTip: false })
  assert.equal(result.subtotalCents, 22500)
  assert.equal(result.originalItbisCents, 3240)
  assert.equal(result.totalCents, 22500)
  assert.equal(result.lines[0].exemptTotalCents, 18000)
})

test("rechaza importes inválidos antes de preparar la venta", () => {
  const input = { lines: [{ unitPriceCents: 11800, qty: 1, itbisRateBp: 1800 }], priceIncludesItbis: true, discountPercentBp: 0, shippingCents: 0, applyLegalTip: false }
  assert.throws(() => calculateExemptSalePrices({ ...input, shippingCents: -1 }))
  assert.throws(() => calculateExemptSalePrices({ ...input, lines: [] }))
  assert.throws(() => calculateExemptSalePrices({ ...input, lines: [{ ...input.lines[0], qty: Number.NaN }] }))
  assert.throws(() => calculateExemptSalePrices({ ...input, lines: [{ ...input.lines[0], qty: 1.001 }] }))
  assert.throws(() => calculateExemptSalePrices({ ...input, lines: [{ ...input.lines[0], itbisRateBp: 1500 }] }))
  assert.throws(() => calculateExemptSalePrices({ ...input, discountPercentBp: -1 }))
})
