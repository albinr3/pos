// Ejecutar el guardado real con datos simulados: sin conexiones a la base del negocio.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
const generic = { id: "general", accountId: "A", isActive: true, isGeneric: true, creditDays: 0, saleDiscountPercentBp: 0 }
const named = { id: "customer", accountId: "A", isActive: true, isGeneric: false, creditDays: 15, saleDiscountPercentBp: 1000 }
const user = { id: "employee", accountId: "A", username: "ana", isOwner: false, canSellWithoutStock: false }

function fixture({ customer = named, stock = 3 } = {}) {
  const state = { customerReads: 0, genericCalls: 0, sales: [], receivables: [], decrements: [], audits: [], revalidations: [] }
  const customers = [generic, ...(customer ? [customer] : [])]
  const product = { id: "pan", name: "Pan", stock, priceCents: 1000, costCents: 300, itbisRateBp: 0, productKind: "BASIC", isActive: true, isAvailableForSale: true, recipeItems: [] }
  const tx = {
    account: { findUnique: async () => ({ id: "A" }) },
    user: { findFirst: async () => user },
    invoiceSequence: { upsert: async () => ({ lastNumber: 1 }) },
    product: {
      findMany: async ({ where }) => { assert.equal(where.accountId, "A"); return where.id.in.includes(product.id) ? [product] : [] },
      updateMany: async ({ where, data }) => { assert.equal(where.accountId, "A"); state.decrements.push(Number(data.stock.decrement)); return { count: 1 } },
    },
    customer: { findFirst: async ({ where }) => {
      state.customerReads++
      assert.equal(where.accountId, "A")
      return customers.find(c => c.id === where.id && c.accountId === where.accountId) ?? null
    } },
    sale: { create: async ({ data }) => { state.sales.push(data); return { id: "sale", ...data } } },
    accountReceivable: { create: async ({ data }) => { state.receivables.push(data); return data } },
  }
  const mocks = {
    "@prisma/client": require("@prisma/client"),
    "@prisma/client/runtime/library": require("@prisma/client/runtime/library"),
    "@/lib/cash-context": { withCashOperation: (_operation, _payload, fn) => fn(), CashControlError: class extends Error {} },
    "@/lib/auth": { getCurrentUserWithDiagnostics: async () => ({ user }) },
    "@/lib/db": { prisma: { companySettings: { findFirst: async () => ({ salePricesIncludeItbis: true, legalTipEnabled: false }) }, $transaction: async fn => fn(tx) } },
    "@/lib/customer-helpers": { ensureGenericCustomer: async (_tx, accountId) => { assert.equal(accountId, "A"); state.genericCalls++; return generic } },
    "@/lib/audit-log": { logAuditEvent: async (data, client) => { assert.equal(client, tx); state.audits.push(data) } },
    "@/lib/error-logger": { logError: async () => {}, ErrorCodes: {} },
    "@/lib/treasury": { requireTreasuryAccount: async (_tx, input) => { assert.equal(input.accountId, "A"); return { id: "bank", name: "Banco", type: "BANCO" } } },
    "next/cache": { revalidatePath: (...args) => state.revalidations.push(args) },
    "@/lib/dates": {}, "@/lib/customer-display": {},
  }
  const cache = new Map()
  function load(name) {
    if (name in mocks) return mocks[name]
    if (cache.has(name)) return cache.get(name)
    assert.ok(["@/lib/pos-stock", "@/lib/money", "@/lib/transactions", "@/app/(app)/sales/actions"].includes(name), `Importación sin simular: ${name}`)
    const source = fs.readFileSync(new URL(`../src/${name.slice(2)}.ts`, import.meta.url), "utf8")
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const exports = {}
    cache.set(name, exports)
    vm.runInNewContext(compiled, { exports, require: load, Date, console: { ...console, warn() {} } }, { filename: name })
    return exports
  }
  const api = load("@/app/(app)/sales/actions")
  const save = (overrides = {}) => api.createSale({ customerId: "customer", type: "CONTADO", paymentMethod: "TARJETA", treasuryAccountId: "bank", username: user.username, items: [{ productId: "pan", qty: 1, unitPriceCents: 1000, wasPriceOverridden: false }], ...overrides })
  return { state, save }
}

test("Una factura nominativa resuelve el cliente una vez y conserva descuento, stock y auditoría", async () => {
  const f = fixture()
  await f.save()
  assert.equal(f.state.customerReads, 1)
  assert.equal(f.state.genericCalls, 0)
  assert.equal(f.state.sales[0].customerId, named.id)
  assert.equal(f.state.sales[0].discountPercentBp, 1000)
  assert.equal(f.state.sales[0].totalCents, 900)
  assert.deepEqual(f.state.decrements, [1])
  assert.equal(f.state.audits[0].action, "SALE_CREATED")
})

test("Crédito conserva el plazo y el saldo del cliente seleccionado", async () => {
  const f = fixture()
  await f.save({ type: "CREDITO", soldAt: "2026-11-01T12:00:00Z" })
  assert.equal(f.state.customerReads, 1)
  assert.equal(f.state.genericCalls, 0)
  assert.equal(f.state.receivables[0].customerId, named.id)
  assert.equal(f.state.receivables[0].balanceCents, 900)
  assert.equal(f.state.receivables[0].dueDate.toISOString(), "2026-11-16T12:00:00.000Z")
})

test("Sin cliente, inactivo, inexistente o de otra cuenta conserva el fallback al general", async () => {
  for (const options of [
    { customerId: null },
    { customerId: "generic" },
    { customer: null },
    { customer: { ...named, isActive: false } },
    { customer: { ...named, accountId: "B" } },
  ]) {
    const f = fixture(options)
    await f.save("customerId" in options ? { customerId: options.customerId } : {})
    assert.equal(f.state.genericCalls, 1)
    assert.equal(f.state.sales[0].customerId, generic.id)
    assert.equal(f.state.sales[0].totalCents, 1000)
  }
})

test("El fallback al general sigue rechazando facturas a crédito", async () => {
  const f = fixture({ customer: null })
  await assert.rejects(f.save({ type: "CREDITO" }), /Para crédito debes seleccionar un cliente/)
  assert.equal(f.state.sales.length, 0)
  assert.equal(f.state.receivables.length, 0)
})

test("El guardado final sigue rechazando stock insuficiente aunque el preflight haya pasado antes", async () => {
  const f = fixture({ stock: 0 })
  await assert.rejects(f.save(), /existencia|disponible/i)
  assert.equal(f.state.sales.length, 0)
  assert.equal(f.state.decrements.length, 0)
})
