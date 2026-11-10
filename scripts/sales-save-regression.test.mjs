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
const user = { id: "employee", accountId: "A", username: "ana", isOwner: false, canAccessSales: true, canSellWithoutStock: false }

function fixture({ customer = named, stock = 3, fiscalEnabled = false, fiscalMatch = false } = {}) {
  const state = { customerReads: 0, genericCalls: 0, sales: [], receivables: [], decrements: [], audits: [], revalidations: [] }
  let cashScope = {}
  const customers = [generic, ...(customer ? [customer] : [])]
  const product = { id: "pan", name: "Pan", stock, priceCents: 1000, costCents: 300, itbisRateBp: 0, productKind: "BASIC", isActive: true, isAvailableForSale: true, recipeItems: [] }
  const tx = {
    account: { findUnique: async () => ({ id: "A" }) },
    fiscalSettings: { findUnique: async () => fiscalEnabled ? { enabled:true, jurisdiction:"DO", regime:"DO_ECF", environment:"TEST", configurationStatus:"VALIDATED", version:1 } : null },
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
    sale: { create: async ({ data, select }) => { assert.equal(select.notes, true); state.sales.push(data); return { id: "sale", ...data } } },
    accountReceivable: { create: async ({ data }) => { state.receivables.push(data); return data } },
  }
  const mocks = {
    "@prisma/client": require("@prisma/client"),
    "@prisma/client/runtime/library": require("@prisma/client/runtime/library"),
    "@/lib/cash-context": { cashRequest: { getStore: () => cashScope, run: (scope, fn) => { cashScope = scope; return fn() } }, resolveCashIdentity: async () => ({ actor:user, deviceHash:"" }), withCashOperation: (_operation, _payload, fn) => fn(), CashControlError: class extends Error { constructor(code, message) { super(message); this.code = code } } },
    "@/lib/permissions": { hasPermission: (actor, key) => !!(actor.isOwner || actor[key]) },
    "@/lib/fiscal/core/sale-command": { parseFiscalSaleCommand: input => { if (!input.expectedPolicyVersion) throw new Error("La versión fiscal es obligatoria"); return input } },
    "@/lib/fiscal/core/sale-customer": { resolveFiscalBuyerCustomer: async () => fiscalMatch ? "customer" : null },
    "@/lib/fiscal/core/sale-document": { buildFiscalSaleDocument: async () => ({ document:{}, metadata:{} }) },
    "@/lib/fiscal/core/preparation": { prepareFiscalSaleInTransaction: async () => ({ id:"doc", type:"E31", state:"PREPARADO_PENDIENTE_CONEXION", eNcf:"E310000000001" }) },
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
    assert.ok(["@/lib/pos-stock", "@/lib/money", "@/lib/transactions", "@/lib/sale-notes", "@/lib/fiscal/core/input", "@/app/(app)/sales/actions"].includes(name), `Importación sin simular: ${name}`)
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

test("Rechaza cantidades con tres decimales sin crear la venta ni mover inventario", async () => {
  const f = fixture()
  await assert.rejects(f.save({ items: [{ productId: "pan", qty: 1.001, unitPriceCents: 1000 }] }), /máximo dos decimales/)
  assert.equal(f.state.sales.length, 0)
  assert.equal(f.state.decrements.length, 0)
})

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

test("Una solicitud fiscal no crea venta, deuda ni mueve inventario", async () => {
  const f = fixture()
  for (const input of [{ type: "E31" }, { fiscal: { type: "E32" } }]) {
    await assert.rejects(f.save(input), /todavía no está disponible|versión fiscal/)
  }
  assert.equal(f.state.sales.length, 0)
  assert.equal(f.state.receivables.length, 0)
  assert.equal(f.state.decrements.length, 0)
})

test("El servidor selecciona el cliente por RNC y exige revisar un total modificado", async () => {
  const cashOperation={accountId:"A",userId:"employee",clientOperationId:"test-fiscal-match",cashShiftId:null,clientSequence:null,fiscalPolicyVersion:1}
  const fiscal={type:"E31",expectedPolicyVersion:1,expectedTotalCents:900,buyer:{name:"Temporal",identification:"101111111",country:"DO"}}
  const accepted=fixture({fiscalEnabled:true,fiscalMatch:true})
  const result=await accepted.save({customerId:null,cashOperation,fiscal})
  assert.equal(accepted.state.sales[0].customerId,"customer");assert.equal(accepted.state.sales[0].totalCents,900);assert.equal(result.fiscal.eNcf,"E310000000001")
  const changed=fixture({fiscalEnabled:true,fiscalMatch:true})
  await assert.rejects(changed.save({customerId:null,cashOperation,fiscal:{...fiscal,expectedTotalCents:1000}}),/total cambió/)
  assert.equal(changed.state.sales.length,0);assert.equal(changed.state.decrements.length,0)
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

test("Ventas al contado y a crédito guardan la nota normalizada sin cambiar los importes", async () => {
  for (const type of ["CONTADO", "CREDITO"]) {
    const f = fixture()
    const sale = await f.save({ type, notes: "  Entregar mañana.\nLlamar a José.  " })
    assert.equal(f.state.sales[0].notes, "Entregar mañana.\nLlamar a José.")
    assert.equal(sale.notes, f.state.sales[0].notes)
    assert.equal(sale.totalCents, 900)
    assert.equal(f.state.receivables.length, type === "CREDITO" ? 1 : 0)
  }
})

test("Clientes anteriores, notas vacías y null guardan la venta sin nota", async () => {
  for (const notes of [undefined, null, "", " \n\t "]) {
    const f = fixture()
    const sale = await f.save({ notes })
    assert.equal(sale.notes, null)
    assert.equal(f.state.sales.length, 1)
  }
  const f = fixture()
  assert.equal((await f.save({ notes: "á".repeat(1000) })).notes.length, 1000)
})

test("Notas inválidas se rechazan antes de crear la factura, descontar stock o auditar", async () => {
  for (const notes of [1, false, {}, [], "x".repeat(1001)]) {
    const f = fixture()
    await assert.rejects(f.save({ notes }), /nota de la venta/)
    assert.equal(f.state.sales.length, 0)
    assert.equal(f.state.receivables.length, 0)
    assert.equal(f.state.decrements.length, 0)
    assert.equal(f.state.audits.length, 0)
  }
})
