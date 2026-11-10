import { test } from "node:test"
import assert from "node:assert/strict"
const { parseFiscalSaleCommand } = await import("../src/lib/fiscal/core/sale-command")
const { calculateExemptSalePrices } = await import("../src/lib/fiscal/core/sale-pricing")
const cases = [
  {type:"E44",special:{regime:"Régimen",exemptionReference:"Soporte"}},
  {type:"E45",special:{governmentEntity:true,purchaseOrder:"OC-1"}},
  {type:"E46",special:{exportMode:"EXPORTACION",destinationCountry:"US"}},
] as const
for (const item of cases) test(`${item.type}: válido, incompleto e incompatible`, () => {
  assert.equal(parseFiscalSaleCommand({...item,expectedPolicyVersion:1}).type,item.type)
  assert.throws(()=>parseFiscalSaleCommand({type:item.type,expectedPolicyVersion:1,special:{}}))
  assert.throws(()=>parseFiscalSaleCommand({...item,expectedPolicyVersion:1,currency:"USD"}))
})
test("la base confirmada se recalcula desde el precio original", () => {
  const input={lines:[{unitPriceCents:11800,qty:1,itbisRateBp:1800}],priceIncludesItbis:true,discountPercentBp:0,shippingCents:0,applyLegalTip:false}
  assert.equal(calculateExemptSalePrices(input).totalCents,10000)
  assert.equal(calculateExemptSalePrices(input).originalItbisCents,1800)
})
