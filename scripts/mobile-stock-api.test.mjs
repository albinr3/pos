import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function load(file, imports) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => imports[name], Map, Set, Date, Number })
  return exports
}
const stock = load("src/lib/pos-stock.ts", {})
function fixture({ authenticated = true, permitted = false, owner = false, canEdit = true, access = true, stockQty = 1 } = {}) {
  const user = { id: "u", accountId: "A", isOwner: owner, canAccessSales: access, canSellWithoutStock: permitted, canEditSales: canEdit, role: "ADMIN" }
  const products = [
    { id: "pan", accountId: "A", name: "Pan", stock: stockQty, isActive: true, isAvailableForSale: true, productKind: "BASIC", recipeItems: [] },
    { id: "receta", accountId: "A", name: "Receta", stock: 0, isActive: true, isAvailableForSale: true, productKind: "RECIPE", recipeItems: [{ ingredientId: "pan", qty: 1, ingredient: { name: "Pan", stock: stockQty, isActive: true } }] },
  ]
  let reads = 0
  const api = load("src/app/api/sales/stock/route.ts", {
    "next/server": { NextResponse: { json: (data, options = {}) => ({ status: options.status ?? 200, data }) } },
    "../../_helpers/auth": { getCurrentUserFromRequest: async () => authenticated ? user : null },
    "@/lib/pos-stock": stock,
    "@/lib/db": { prisma: { $transaction: async work => work({
      product: { findMany: async query => { assert.equal(query.where.accountId, "A"); reads++; return products.filter(product => query.where.id.in.includes(product.id)) } },
      sale: { findFirst: async query => query.where.id === "sale-A" && query.where.accountId === "A" ? { items: [{ productId: "pan", consumptions: [{ ingredientId: "pan", qty: 1 }] }] } : null },
    }) } },
  })
  return { products, reads: () => reads, request: body => api.POST({ json: async () => body }) }
}
const item = (productId = "pan", qty = 1, recipeAdjustments = []) => ({ productId, qty, recipeAdjustments })
test("API móvil rechaza sesión, módulo y edición sin permiso antes de leer inventario", async () => {
  assert.equal((await fixture({ authenticated: false }).request({ items: [item()] })).status, 401)
  const f = fixture({ access: false }); assert.equal((await f.request({ items: [item()] })).status, 403); assert.equal(f.reads(), 0)
  assert.equal((await fixture({ canEdit: false }).request({ items: [item()], saleId: "sale-A" })).status, 403)
})
test("API móvil devuelve faltantes estructurados sin crear documentos ni descontar", async () => {
  const f = fixture({ stockQty: 0 }); const response = await f.request({ items: [item()] })
  assert.equal(response.status, 200); assert.equal(response.data.ok, false); assert.equal(response.data.issue.available, 0)
  assert.equal(f.products[0].stock, 0); assert.equal(response.data.userId, "u")
})
test("API agrega consumos de recetas y productos directos, sin usar stock del padre", async () => {
  assert.equal((await fixture().request({ items: [item("receta")] })).data.ok, true)
  const response = await fixture().request({ items: [item("receta"), item("pan")] })
  assert.equal(response.data.ok, false); assert.equal(response.data.issue.requested, 2)
})
test("API respeta EXTRA y SIN y no concede autorización por rol ADMIN", async () => {
  const f = fixture(); const response = await f.request({ items: [item("receta", 1, [{ ingredientId: "pan", adjustmentType: "EXTRA" }])] })
  assert.equal(response.data.ok, false); assert.equal(response.data.issue.requested, 2)
  assert.equal((await fixture({ stockQty: 0 }).request({ items: [item()] })).data.ok, false)
  for (const permission of [{ permitted: true }, { owner: true }]) assert.equal((await fixture({ ...permission, stockQty: 0 }).request({ items: [item()] })).data.ok, true)
})
test("API acredita únicamente la factura editada de la misma cuenta", async () => {
  assert.equal((await fixture({ stockQty: 0 }).request({ items: [item()], saleId: "sale-A" })).data.ok, true)
  assert.equal((await fixture({ stockQty: 0 }).request({ items: [item()], saleId: "otra-cuenta" })).status, 404)
})
test("API rechaza cuerpos y cantidades inválidos", async () => {
  for (const body of [null, {}, { items: [] }, { items: [item("pan", 0)] }, { items: [item("pan", "1")] }, { items: [item({}, 1)] }, { items: [item("pan", 1, [null])] }]) {
    assert.equal((await fixture().request(body)).status, 400)
  }
})
