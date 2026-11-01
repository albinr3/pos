// Código real con inventario y sesión simulados; nunca usa la base de producción.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function load(file, mocks = {}, globals = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: name => mocks[name] ?? {}, Map, Set, Date, console, ...globals }, { filename: file })
  return exports
}
const stock = load("src/lib/pos-stock.ts")
const normal = (id = "pan", qty = 1) => ({ productId: id, name: id, qty, productKind: "BASIC", recipeItems: [], recipeAdjustments: [] })
const ingredient = (id, qty = 1) => ({ ingredientId: id, ingredientName: id, ingredientStock: 5, ingredientIsActive: true, qty })
const recipe = (id, ingredients, qty = 1, recipeAdjustments = []) => ({ productId: id, name: id, productKind: "RECIPE", qty, recipeItems: ingredients, recipeAdjustments })
const inventory = (stocks) => new Map(Object.entries(stocks).map(([id, value]) => [id, { id, name: id, stock: value, isActive: true, snapshotAt: 1 }]))
const issueFor = (lines, stocks, reserved = []) => {
  const result = stock.getStockConsumptions(lines)
  return result.issue ?? stock.validateStockConsumptions(result.consumptions, inventory(stocks), reserved)
}

test("Stock cero y negativo impiden agregar; la cantidad exacta se permite", () => {
  for (const qty of [0, -2]) assert.equal(issueFor([normal()], { pan: qty }).kind, "insufficient")
  assert.equal(issueFor([normal("pan", 2)], { pan: 2 }), null)
  assert.equal(issueFor([normal("pan", 3)], { pan: 2 }).requested, 3)
})
test("Líneas repetidas y reservas offline comparten la misma existencia", () => {
  assert.equal(issueFor([normal(), normal()], { pan: 1 }).available, 1)
  assert.equal(issueFor([normal()], { pan: 2 }, [{ ingredientId: "pan", qty: 2 }]).available, 0)
})
test("Recetas comparten insumos con otras recetas y con su venta directa", () => {
  const lines = [recipe("sandwich", [ingredient("pan", 2)]), recipe("tostada", [ingredient("pan")]), normal()]
  assert.equal(issueFor(lines, { pan: 4 }), null)
  assert.equal(issueFor(lines, { pan: 3 }).requested, 4)
})
test("SIN excluye el consumo y EXTRA duplica cada variante", () => {
  const lines = [recipe("sandwich", [ingredient("pan"), ingredient("queso")], 2, [{ ingredientId: "queso", adjustmentType: "SIN" }]), recipe("sandwich", [ingredient("pan"), ingredient("queso")], 1, [{ ingredientId: "queso", adjustmentType: "EXTRA" }])]
  const result = stock.getStockConsumptions(lines)
  assert.equal(result.issue, null)
  assert.equal(JSON.stringify(result.consumptions), JSON.stringify([{ ingredientId: "pan", qty: 3 }, { ingredientId: "queso", qty: 2 }]))
  assert.equal(issueFor(lines, { pan: 3, queso: 1 }).name, "queso")
})
test("Redondeo de consumos a tres decimales sin falsos faltantes", () => {
  assert.equal(issueFor([recipe("r", [ingredient("kg", 0.333)], 3)], { kg: 0.999 }), null)
  const lines = [recipe("r", [ingredient("kg", 0.3333)], 1.5, [{ ingredientId: "kg", adjustmentType: "EXTRA" }])]
  assert.equal(stock.getStockConsumptions(lines).consumptions[0].qty, 1)
})
test("Cantidad medida inicial usa 0,3 kg y nunca redondea hacia arriba", () => {
  assert.equal(stock.initialStockQuantity(0.3, true, false), 0.3)
  assert.equal(stock.initialStockQuantity(0.309, true, false), 0.3)
  assert.equal(stock.initialStockQuantity(10, true, false), 1)
  assert.equal(stock.initialStockQuantity(-2, true, true), 1)
  assert.equal(stock.initialStockQuantity(0, false, false), 1)
})
test("Caché incompleto, insumo inactivo y recetas sin consumo bloquean", () => {
  assert.equal(issueFor([normal()], {}).kind, "missing")
  const inv = inventory({ pan: 2 }); inv.get("pan").isActive = false
  assert.equal(stock.validateStockConsumptions([{ ingredientId: "pan", qty: 1 }], inv).kind, "inactive")
  assert.equal(stock.getStockConsumptions([recipe("r", [])]).issue.kind, "invalid")
  assert.equal(stock.getStockConsumptions([recipe("r", [ingredient("pan")], 1, [{ ingredientId: "pan", adjustmentType: "SIN" }])]).issue.kind, "invalid")
  assert.equal(stock.getStockConsumptions([normal("pan", Number.NaN)]).issue.kind, "invalid")
})
test("Reducir o eliminar permite corregir carritos inválidos sin aumentar otro insumo", () => {
  assert.equal(stock.stockConsumptionDoesNotIncrease([normal("pan", 5)], [normal("pan", 4)]), true)
  assert.equal(stock.stockConsumptionDoesNotIncrease([normal()], []), true)
  assert.equal(stock.stockConsumptionDoesNotIncrease([normal()], [normal("queso")]), false)
})
test("El inventario ignora otras cuentas y prefiere la instantánea más reciente", () => {
  const products = [{ id: "pan", name: "pan", stock: 5, accountId: "A", stockSnapshotAt: 1 }, { id: "pan", name: "pan", stock: 100, accountId: "B", stockSnapshotAt: 9 }, { id: "r", name: "r", stock: 0, accountId: "A", stockSnapshotAt: 2, recipeItems: [ingredient("pan")] }]
  const inv = stock.buildStockInventory(products, "A", [{ id: "pan", name: "pan", stock: 0, isActive: true, snapshotAt: 3 }])
  assert.equal(inv.get("pan").stock, 0)
  assert.equal(stock.buildStockInventory([{ id: "x", name: "x", stock: 10 }], "A").size, 0)
})

function serverFixture({ permitted = false, owner = false, authenticated = true } = {}) {
  const products = [
    { id: "pan", name: "Pan", stock: 1, priceCents: 100, costCents: 50, productKind: "BASIC", isActive: true, isAvailableForSale: true, recipeItems: [] },
    { id: "r", name: "Receta", stock: 0, priceCents: 200, costCents: 50, productKind: "RECIPE", isActive: true, isAvailableForSale: true, recipeItems: [{ ingredientId: "pan", qty: 1, ingredient: { name: "Pan", costCents: 50 } }] },
  ]
  let reads = 0
  const tx = { product: { findMany: async query => { reads++; assert.equal(query.where.accountId, "A"); return products.filter(p => query.where.id.in.includes(p.id)) } } }
  const api = load("src/app/(app)/sales/actions.ts", {
    "@/lib/pos-stock": stock,
    "@/lib/auth": { getCurrentUser: async () => authenticated ? { id: "u", accountId: "A", canSellWithoutStock: permitted, isOwner: owner } : null },
    "@/lib/db": { prisma: { $transaction: async callback => callback(tx) } },
    "@prisma/client": { ProductKind: { RECIPE: "RECIPE" }, RecipeAdjustmentType: { SIN: "SIN", EXTRA: "EXTRA" } },
  })
  return { module: api, products, reads: () => reads }
}
const inputItem = (productId, qty = 1, recipeAdjustments = []) => ({ productId, qty, unitPriceCents: 100, wasPriceOverridden: false, recipeAdjustments })
test("Preflight autentica y solo lee inventario, sin facturar ni crear pendientes", async () => {
  const f = serverFixture()
  const result = await f.module.checkSaleStock([inputItem("pan", 2)])
  assert.equal(result.ok, false)
  assert.equal(result.issue.available, 1)
  assert.equal(result.accountId, "A")
  assert.equal(f.products[0].stock, 1)
  assert.equal(f.reads(), 2)
  await assert.rejects(serverFixture({ authenticated: false }).module.checkSaleStock([inputItem("pan")]), /No autenticado/)
})
test("Preflight suma consumos reales de recetas y usa los permisos actuales", async () => {
  assert.equal((await serverFixture().module.checkSaleStock([inputItem("r"), inputItem("pan")])).ok, false)
  for (const permissions of [{ permitted: true }, { owner: true }]) {
    const result = await serverFixture(permissions).module.checkSaleStock([inputItem("r", 3)])
    assert.equal(result.ok, true)
    assert.equal(result.allowNegativeStock, true)
    assert.equal(result.consumptions[0].qty, 3)
  }
})

test("Pendientes reales reservan por cuenta y sobreviven a una recarga del lector", async () => {
  const pending = { kind: "sale", cashOperation: { accountId: "A" }, payload: {}, stockConsumptions: [{ ingredientId: "pan", qty: 1 }] }
  const api = load("src/lib/pos-stock-offline.ts", {
    "./cash-offline": { cashPending: async () => [pending, { ...pending, cashOperation: { accountId: "B" } }] },
    "./indexed-db": { getProductsCache: async () => [{ id: "pan", name: "Pan", stock: 2, accountId: "A" }], getPendingSales: async () => [] },
    "./pos-stock": stock, "./stock-cache-state": { stockCacheToken: () => null },
  })
  for (let i = 0; i < 2; i++) {
    const state = await api.readPosStockState("A")
    assert.equal(state.reserved.length, 1)
    assert.equal(state.reserved[0].qty, 1)
    assert.equal(state.incomplete, false)
  }
})
test("Una reserva antigua imposible de reconstruir exige sincronización", async () => {
  const api = load("src/lib/pos-stock-offline.ts", {
    "./cash-offline": { cashPending: async () => [] },
    "./indexed-db": { getProductsCache: async () => [], getPendingSales: async () => [{ items: [inputItem("desconocido")] }] },
    "./pos-stock": stock, "./stock-cache-state": { stockCacheToken: () => null },
  })
  assert.equal((await api.readPosStockState("A")).incomplete, true)
})
test("Confirmar una venta invalida hasta refrescar; una consulta antigua no libera stock", () => {
  const storage = new Map(); let sequence = 0
  const api = load("src/lib/stock-cache-state.ts", {}, {
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    crypto: { randomUUID: () => String(++sequence) }, window: { dispatchEvent() {} }, Event: class {},
  })
  api.invalidateStockCache("A")
  const token = api.stockCacheToken("A")
  api.invalidateStockCache("A")
  api.acknowledgeStockCache("A", token)
  assert.notEqual(api.stockCacheToken("A"), null)
  api.acknowledgeStockCache("A", api.stockCacheToken("A"))
  assert.equal(api.stockCacheToken("A"), null)
})
