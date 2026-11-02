// Solo datos ficticios en una base local explícita; jamás tomar DATABASE_URL como alternativa.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import http from "node:http"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { PrismaClient } from "@prisma/client"

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error("Define TEST_DATABASE_URL; DATABASE_URL nunca se usa")
const parsed = new URL(url)
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !/cash_test/.test(parsed.pathname)) throw new Error("Se requiere una base local desechable cash_test")
const db = new PrismaClient({ datasources: { db: { url } } })
let reportReads = null
db.$use(async (params, next) => {
  if (reportReads && params.model === "Purchase" && params.action === "findMany") reportReads.push(params.args)
  return next(params)
})
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), require = createRequire(import.meta.url), modules = new Map()
const clerkTokens = new Map(), secret = randomUUID(), jwt = require("jsonwebtoken")
let webActor = null
function load(name, from = path.join(root, "src/_entry.ts")) {
  if (name === "next/cache") return { revalidatePath() {} }
  if (name === "next/headers") return { headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }
  if (name === "@/lib/auth") return {
    getCurrentUser: async () => webActor ?? load("@/lib/cash-context").cashRequest.getStore()?.trustedActor ?? null,
    getClerkUserIdFromToken: async token => clerkTokens.get(token) ?? null,
    getSubUserSession: async token => { try { return jwt.verify(token, secret) } catch { return null } },
  }
  if (name === "@/lib/openai") return { openai: { chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify({ supplierName: "Fixture", products: [] }) } }] }) } } } }
  if (name === "@/lib/error-logger") return { logError: async () => {}, ErrorCodes: {} }
  if (name === "@prisma/client") return { ...require(name), PrismaClient: class { constructor() { throw new Error("Prohibidos clientes implícitos en pruebas") } } }
  if (!name.startsWith("@/") && !name.startsWith(".")) return require(name)
  const file = name.startsWith("@/") ? path.join(root, "src", name.slice(2) + ".ts") : path.resolve(path.dirname(from), name + ".ts")
  if (modules.has(file)) return modules.get(file)
  const exports = {}; modules.set(file, exports)
  const source = fs.readFileSync(file, "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(compiled, { exports, require: n => load(n, file), console: { ...console, log() {} }, Date, Map, Set, process, Headers, Response, Request, Buffer, globalThis: { prisma: db } }, { filename: file })
  return exports
}
const { cashRequest, withCashOperation } = load("@/lib/cash-context"), cash = load("@/lib/cash-shifts"), money = load("@/lib/cash-money")
const purchases = load("@/lib/purchases"), payments = load("@/lib/accounts-payable"), reports = load("@/lib/purchase-reports"), rules = load("@/lib/purchase-credit")
const fixtureAccounts = []
async function fixture() {
  const account = await db.account.create({ data: { name: "Credit test", clerkUserId: randomUUID() } }); fixtureAccounts.push(account.id)
  const actor = await db.user.create({ data: { accountId: account.id, name: "Ana", username: "ana", passwordHash: "test-only", isOwner: true, canOperateCashShifts: true } })
  const supplier = await db.supplier.create({ data: { accountId: account.id, name: "Proveedor prueba", creditDays: 30 } })
  const product = await db.product.create({ data: { accountId: account.id, productId: 1, name: "Mercancía", priceCents: 15000, costCents: 10000, stock: 0, itbisRateBp: 0 } })
  // La creación habitual de productos actualiza su secuencia; el fixture debe representar ese estado.
  await db.productSequence.create({ data: { accountId: account.id, lastNumber: 1 } })
  const box = await db.treasuryAccount.create({ data: { accountId: account.id, name: "Caja efectivo", type: "CAJA" } })
  const bank = await db.treasuryAccount.create({ data: { accountId: account.id, name: "Banco", type: "BANCO" } })
  return { account, actor, supplier, product, box, bank }
}
function scope(f, run, extra = {}) { return cashRequest.run({ trustedActor: f.actor, deviceHash: "credit-device", ...extra }, run) }
function input(f, extra = {}) { return { type: "CREDITO", supplierId: f.supplier.id, dueDate: "2026-12-01", operationId: randomUUID(), initialPaymentCents: 0, updateProductCost: true, updateProductPrice: false, items: [{ productId: f.product.id, qty: 10, unitCostCents: 100000 }], ...extra } }
async function buy(f, extra = {}) { return scope(f, () => purchases.createPurchase(f.actor, input(f, extra))) }
async function getAP(f, purchaseId) { return db.accountPayable.findUniqueOrThrow({ where: { purchaseId } }) }
function payment(f, ap, extra = {}) { return { apId: ap.id, amountCents: 100000, method: "TRANSFERENCIA", treasuryAccountId: f.bank.id, operationId: randomUUID(), ...extra } }
async function activate(f) {
  const preview = await cash.previewCashActivation(f.actor)
  await cash.activateCashControl(f.actor, { treasuryAccountId: f.box.id, countedCents: 0, previewToken: preview.previewToken })
  f.shift = await cash.openCashShift(f.actor, "credit-device", 0)
}
function operation(f, sequence) { return { accountId: f.account.id, userId: f.actor.id, clientOperationId: randomUUID(), cashShiftId: f.shift.id, clientSequence: sequence } }

test("migración conserva la compra previa sin inferir proveedor ni deuda", async () => {
  const purchase = await db.purchase.findUniqueOrThrow({ where: { id: "credit-migration-purchase" }, include: { payable: true } })
  assert.equal(purchase.type, "CONTADO"); assert.equal(purchase.totalCents, 70000); assert.equal(purchase.supplierId, null); assert.equal(purchase.payable, null)
  assert.equal((await db.supplier.findUniqueOrThrow({ where: { id: "credit-migration-supplier" } })).creditDays, 0)
})
test("migración de pagos existentes rellena proveedor y nombre histórico", async () => {
  const payment = await db.supplierPayment.findUniqueOrThrow({ where: { id: "credit-snapshot-payment" } })
  assert.equal(payment.supplierId, "credit-migration-supplier")
  assert.equal(payment.supplierName, "Proveedor registrado al comprar")
})
test("compra 10,000 con abono 2,000 ingresa inventario completo y adeuda 8,000; reintento no duplica", async () => {
  const f = await fixture(), command = input(f, { initialPaymentCents: 200000, paymentMethod: "TRANSFERENCIA", treasuryAccountId: f.bank.id })
  const purchase = await scope(f, () => purchases.createPurchase(f.actor, command))
  const repeated = await scope(f, () => purchases.createPurchase(f.actor, command))
  assert.deepEqual(JSON.parse(JSON.stringify(repeated)), JSON.parse(JSON.stringify(purchase)))
  const ap = await getAP(f, purchase.id)
  assert.equal(ap.balanceCents, 800000); assert.equal(ap.status, "PARCIAL")
  assert.equal(Number((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock), 10)
  assert.equal(await db.purchase.count({ where: { accountId: f.account.id } }), 1)
  assert.equal(await db.supplierPayment.count({ where: { accountId: f.account.id } }), 1)
  const ledger = money.documentLegs("purchase", purchase); assert.equal(ledger.length, 0)
  await assert.rejects(scope(f, () => purchases.createPurchase(f.actor, { ...command, initialPaymentCents: 300000 })), e => e.code === "OPERATION_CONFLICT")
  const treasury = await scope(f, () => load("@/app/(app)/treasury/actions").getTreasuryDashboard())
  assert.equal(treasury.totals.outCents, 200000)
})
test("concurrencia y sobrepago: solo se confirma un pago si ambos excederían el saldo", async () => {
  const f = await fixture(), p = await buy(f), ap = await getAP(f, p.id)
  const results = await Promise.allSettled([600000, 600000].map(amountCents => scope(f, () => payments.addSupplierPayment(f.actor, payment(f, ap, { amountCents })))))
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1)
  assert.equal((await getAP(f, p.id)).balanceCents, 400000)
  assert.equal(await db.supplierPayment.count({ where: { accountId: f.account.id } }), 1)
})
test("liquidación idempotente, reverso único y edición protegida", async () => {
  const f = await fixture(), p = await buy(f), ap = await getAP(f, p.id), cmd = payment(f, ap, { amountCents: 1000000 })
  const pay = await scope(f, () => payments.addSupplierPayment(f.actor, cmd))
  assert.equal((await getAP(f, p.id)).status, "PAGADA")
  assert.equal((await scope(f, () => payments.addSupplierPayment(f.actor, cmd))).id, pay.id)
  await assert.rejects(scope(f, () => purchases.cancelPurchase(f.actor, p.id)), e => e.code === "ACTIVE_PAYMENTS")
  await assert.rejects(scope(f, () => purchases.updatePurchase(f.actor, { ...input(f), id: p.id })), e => e.code === "ACTIVE_PAYMENTS")
  await scope(f, () => purchases.patchPurchase(f.actor, p.id, { notes: "Nota nueva", dueDate: "2027-01-01" }))
  await scope(f, () => payments.cancelSupplierPayment(f.actor, pay.id, "Error de registro"))
  await scope(f, () => payments.cancelSupplierPayment(f.actor, pay.id, "Reintento"))
  assert.equal((await getAP(f, p.id)).balanceCents, 1000000)
  await scope(f, () => purchases.cancelPurchase(f.actor, p.id))
  assert.equal(Number((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock), 0)
  assert.equal((await scope(f, () => payments.listPayables(f.actor))).summary.count, 0)
})
test("proveedor inactivo admite pagar deuda previa; validaciones y aislamiento entre negocios", async () => {
  const f = await fixture(), other = await fixture(), p = await buy(f), ap = await getAP(f, p.id)
  await db.supplier.update({ where: { id: f.supplier.id }, data: { isActive: false } })
  await scope(f, () => payments.addSupplierPayment(f.actor, payment(f, ap)))
  await assert.rejects(buy(f), e => e.code === "INVALID_SUPPLIER")
  await assert.rejects(scope(other, () => payments.getPayable(other.actor, ap.id)), e => e.code === "NOT_FOUND")
  await assert.rejects(scope(other, () => payments.addSupplierPayment(other.actor, payment(other, ap))), e => e.code === "NOT_FOUND")
  await assert.rejects(scope(f, () => payments.addSupplierPayment({ ...f.actor, isOwner: false, canRegisterSupplierPayments: false }, payment(f, ap))), e => e.code === "FORBIDDEN")
  for (const amountCents of [0, -1, 1.5, NaN, Infinity, 2147483648]) await assert.rejects(scope(f, () => payments.addSupplierPayment(f.actor, payment(f, ap, { amountCents }))), e => e.code === "INVALID_AMOUNT")
})
test("vencimiento cambia a medianoche UTC-4, valida calendario y plazo", () => {
  const due = rules.dateOnly("2026-11-01")
  assert.equal(rules.overdueDays(due, 100, new Date("2026-11-02T03:59:59Z")), 0)
  assert.equal(rules.overdueDays(due, 100, new Date("2026-11-02T04:00:00Z")), 1)
  assert.equal(rules.overdueDays(due, 0, new Date("2026-11-03T04:00:00Z")), 0)
  assert.throws(() => rules.dateOnly("2026-02-30")); assert.throws(() => rules.creditDays(-1))
})
test("caja contabiliza abono una vez, exige turno/dispositivo y conserva cierre con reverso posterior", async () => {
  const f = await fixture(); await activate(f)
  const command = input(f, { initialPaymentCents: 200000, paymentMethod: "EFECTIVO", treasuryAccountId: f.box.id, cashOperation: operation(f, 1) })
  const p = await scope(f, () => purchases.createPurchase(f.actor, command))
  assert.equal(await db.cashMovement.count({ where: { accountId: f.account.id, sourceType: "purchase" } }), 0)
  assert.equal((await db.cashMovement.findFirstOrThrow({ where: { accountId: f.account.id, sourceType: "supplierPayment" } })).amountCents, -200000)
  const ap = await getAP(f, p.id)
  await assert.rejects(scope(f, () => payments.addSupplierPayment(f.actor, payment(f, ap, { method: "EFECTIVO", treasuryAccountId: f.box.id, cashOperation: operation(f, 2) })), { deviceHash: "otro" }), e => e.code === "CASH_SHIFT_MISMATCH")
  // Registrar fondo ficticio antes de cerrar para que el conteo físico no sea negativo.
  await cash.manualCashMovement(f.actor, "credit-device", { shiftId: f.shift.id, kind: "OWNER_IN", amountCents: 200000, note: "Fondo de prueba", operationId: randomUUID() })
  await cash.prepareCashClose(f.actor, "credit-device", f.shift.id, 1)
  await cash.finishCashClose(f.actor, "credit-device", f.shift.id, { countedCents: 0, expectedCents: 0 })
  const closed = await db.cashShift.findUniqueOrThrow({ where: { id: f.shift.id } }), supplierPay = await db.supplierPayment.findFirstOrThrow({ where: { accountId: f.account.id } })
  await scope(f, () => purchases.patchPurchase(f.actor, p.id, { notes: "Seguimiento al proveedor", dueDate: "2027-01-01" }))
  assert.deepEqual((await db.cashShift.findUniqueOrThrow({ where: { id: closed.id } })).closingSnapshot, closed.closingSnapshot)
  await assert.rejects(scope(f, () => payments.cancelSupplierPayment(f.actor, supplierPay.id, "Corrección")), e => e.code === "CASH_DOCUMENT_CLOSED")
  f.shift = await cash.openCashShift(f.actor, "credit-device", 0)
  await cash.correctClosedCashDocument(f.actor, "credit-device", { sourceType: "supplierPayment", sourceId: supplierPay.id, moneyMoved: true, reason: "Recuperación real" })
  assert.deepEqual((await db.cashShift.findUniqueOrThrow({ where: { id: closed.id } })).closingSnapshot, closed.closingSnapshot)
  assert.equal((await getAP(f, p.id)).balanceCents, 1000000)
})
test("reportes separan meses, resumen completo y exportaciones coinciden", async () => {
  const f = await fixture(), p = await buy(f), ap = await getAP(f, p.id)
  await db.purchase.update({ where: { id: p.id }, data: { purchasedAt: new Date("2026-09-15T15:00:00Z") } })
  const pay = await scope(f, () => payments.addSupplierPayment(f.actor, payment(f, ap, { amountCents: 300000 })))
  await db.supplierPayment.update({ where: { id: pay.id }, data: { paidAt: new Date("2026-10-15T15:00:00Z") } })
  const bought = await reports.purchaseReport(f.actor, "purchases", { from: "2026-09-01", to: "2026-09-30", take: 1 })
  const paid = await reports.purchaseReport(f.actor, "supplier-payments", { from: "2026-10-01", to: "2026-10-31" })
  assert.equal(bought.summary.totalCents, 1000000); assert.equal(bought.summary.balanceCents, 700000); assert.equal(paid.summary.amountCents, 300000)
  assert.equal((await reports.purchaseReport(f.actor, "purchases", { from: "2026-10-01", to: "2026-10-31" })).summary.totalCents, 0)
  const exporter = load("@/lib/purchase-report-export"), xlsx = await exporter.purchaseReportResponse(bought, "xlsx"), XLSX = require("xlsx")
  const book = XLSX.read(await xlsx.arrayBuffer(), { type: "array" }), rows = XLSX.utils.sheet_to_json(book.Sheets.Reporte, { header: 1 })
  assert.equal(rows[6][4], 10000); assert.equal(rows[6][6], 7000)
  const pdf = await exporter.purchaseReportResponse(bought, "pdf"); assert.match(Buffer.from(await pdf.arrayBuffer()).toString("latin1"), /%PDF-/)
})
test("OCR comparte el registro y el reintento no vuelve a crear productos", async () => {
  const f = await fixture(), command = { type: "CREDITO", supplierId: f.supplier.id, supplierName: null, dueDate: "2026-12-01", operationId: randomUUID(), products: [{ productId: null, sku: null, reference: null, description: "Nuevo OCR", quantity: 2, unitCostCents: 10000, createNew: true }], updateProductPrice: false }
  const service = load("@/lib/purchase-ocr"), result = await scope(f, () => service.createPurchaseFromOCR(f.actor, command))
  assert.equal((await scope(f, () => service.createPurchaseFromOCR(f.actor, command))).id, result.id)
  assert.equal(await db.product.count({ where: { accountId: f.account.id, name: "Nuevo OCR" } }), 1)
  assert.equal((await getAP(f, result.id)).balanceCents, 20000)
})
test("pagar una deuda no vuelve a descontar costos en ganancia ni cambia inventario", async () => {
  const f = await fixture(), p = await buy(f), ap = await getAP(f, p.id)
  await db.sale.create({ data: { accountId: f.account.id, userId: f.actor.id, invoiceCode: "A-CREDIT-TEST", invoiceNumber: 1, type: "CONTADO", subtotalCents: 150000, itbisCents: 0, totalCents: 150000, items: { create: { productId: f.product.id, qty: 1, unitPriceCents: 150000, costCents: 100000, lineTotalCents: 150000, itbisRateBp: 0 } } } })
  const profit = load("@/lib/profit-report"), before = await profit.getProfitReport(f.actor, {})
  await scope(f, () => payments.addSupplierPayment(f.actor, payment(f, ap, { amountCents: 1000000 })))
  const after = await profit.getProfitReport(f.actor, {})
  assert.equal(before.costOfSalesCents, 100000); assert.equal(before.netProfitCents, 50000)
  assert.equal(after.costOfSalesCents, before.costOfSalesCents); assert.equal(after.netProfitCents, before.netProfitCents)
  assert.equal(after.accountsPayableTotalCents, 0)
  assert.equal(Number((await db.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock), 10)
  const restricted = await profit.getProfitReport({ ...f.actor, isOwner: false, canAccessReports: true, canViewProfitReport: true, canAccessAccountsPayable: false }, {})
  assert.equal(restricted.accountsPayableTotalCents, null)
})
test("activación posterior incorpora solo pagos reales y un reverso conserva la fecha histórica", async () => {
  const f = await fixture(), p = await buy(f), ap = await getAP(f, p.id)
  const pay = await scope(f, () => payments.addSupplierPayment(f.actor, payment(f, ap, { amountCents: 200000 })))
  const paidAt = new Date("2026-09-15T15:00:00Z"), cancelledAt = new Date("2026-10-15T15:00:00Z")
  await db.supplierPayment.update({ where: { id: pay.id }, data: { paidAt, cancelledAt, cancelledBy: f.actor.id, cancellationReason: "Fixture de reverso" } })
  const treasury = load("@/app/(app)/treasury/actions")
  const september = await scope(f, () => treasury.getTreasuryDashboard({ from: "2026-09-01", to: "2026-09-30" }))
  const october = await scope(f, () => treasury.getTreasuryDashboard({ from: "2026-10-01", to: "2026-10-31" }))
  assert.equal(september.totals.outCents, 200000); assert.equal(september.totals.inCents, 0)
  assert.equal(october.totals.outCents, 0); assert.equal(october.totals.inCents, 200000)
  const other = await fixture(), otherP = await buy(other), otherAP = await getAP(other, otherP.id)
  await scope(other, () => payments.addSupplierPayment(other.actor, payment(other, otherAP, { amountCents: 200000 })))
  const preview = await cash.previewCashActivation(other.actor)
  assert.equal(preview.accounts.find(a => a.id === other.bank.id).balanceCents, -200000)
})

const { NextRequest } = require("next/server")
const routeEntries = [
  ["/api/purchases", "@/app/api/purchases/route"], ["/api/purchases/:id", "@/app/api/purchases/[id]/route"], ["/api/purchases/:id/cancel", "@/app/api/purchases/[id]/cancel/route"],
  ["/api/accounts-payable", "@/app/api/accounts-payable/route"], ["/api/accounts-payable/:id", "@/app/api/accounts-payable/[id]/route"],
  ["/api/supplier-payments", "@/app/api/supplier-payments/route"], ["/api/supplier-payments/options", "@/app/api/supplier-payments/options/route"], ["/api/supplier-payments/:id/cancel", "@/app/api/supplier-payments/[id]/cancel/route"],
  ["/api/reports/purchases", "@/app/api/reports/purchases/route"], ["/api/reports/accounts-payable", "@/app/api/reports/accounts-payable/route"], ["/api/reports/supplier-payments", "@/app/api/reports/supplier-payments/route"], ["/api/reports/profit", "@/app/api/reports/profit/route"],
  ["/api/suppliers", "@/app/api/suppliers/route"], ["/api/auth/me", "@/app/api/auth/me/route"],
  ["/api/cash-shifts", "@/app/api/cash-shifts/route"],
]
const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, "http://localhost"), candidates = routeEntries.filter(([route]) => new RegExp("^" + route.replace(":id", "([^/]+)") + "$", "i").test(requestUrl.pathname)), route = candidates.find(([r]) => !r.includes(":id")) ?? candidates[0]
    if (!route) { res.writeHead(404).end(); return }
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const request = new NextRequest(requestUrl, { method: req.method, headers: req.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
    const id = requestUrl.pathname.match(new RegExp("^" + route[0].replace(":id", "([^/]+)") + "$"))?.[1]
    const response = await load(route[1])[req.method](request, { params: Promise.resolve({ id }) })
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
  } catch (e) { res.writeHead(500).end(String(e.stack)) }
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const base = `http://127.0.0.1:${server.address().port}`
function mobile(f) { const clerk = `Bearer clerk-${f.account.id}`; clerkTokens.set(clerk, f.account.clerkUserId); return { "X-Clerk-Authorization": clerk, "X-SubUser-Token": jwt.sign({ accountId: f.account.id, userId: f.actor.id }, secret), "Content-Type": "application/json" } }
test("HTTP móvil sin cookies: crear, consultar, pagar, reportar, validar y rechazar identidad cruzada", async () => {
  const f = await fixture(), headers = mobile(f), command = input(f)
  let response = await fetch(base + "/api/purchases", { method: "POST", headers, body: JSON.stringify(command) }); const p = await response.json(); assert.equal(response.status, 201, JSON.stringify(p))
  response = await fetch(base + "/api/accounts-payable", { headers }); let data = await response.json(); assert.equal(response.status, 200); assert.equal(data.summary.balanceCents, 1000000)
  assert.equal(data.data[0].dueDate, "2026-12-01")
  const ap = await getAP(f, p.id), cmd = payment(f, ap, { amountCents: 250000 })
  const send = () => fetch(base + "/api/supplier-payments", { method: "POST", headers, body: JSON.stringify(cmd) })
  response = await send(); data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); const firstPayment = data
  assert.deepEqual(await (await send()).json(), firstPayment)
  response = await fetch(base + "/api/reports/accounts-payable", { headers }); data = await response.json(); assert.equal(data.summary.balanceCents, 750000)
  response = await fetch(base + "/api/reports/profit", { headers }); data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); assert.equal(data.accountsPayableTotalCents, 750000)
  response = await fetch(base + "/api/auth/me", { headers }); data = await response.json(); assert.equal(typeof data.user.canAccessAccountsPayable, "boolean")
  response = await fetch(base + "/api/accounts-payable?skip=-1", { headers }); assert.equal(response.status, 400)
  response = await fetch(base + "/api/accounts-payable"); assert.equal(response.status, 401)
  const other = await fixture(), otherHeaders = mobile(other)
  response = await fetch(base + "/api/accounts-payable", { headers: { ...headers, "X-Clerk-Authorization": otherHeaders["X-Clerk-Authorization"] } }); assert.equal(response.status, 401)
  response = await fetch(base + "/api/purchases/" + p.id, { method: "PATCH", headers, body: JSON.stringify({ notes: "Móvil", dueDate: "2027-01-01" }) }); assert.equal(response.status, 200)
  const patched = await response.json()
  assert.equal(patched.balanceCents, 750000); assert.equal(patched.paidCents, 250000); assert.equal(patched.payableId, ap.id); assert.equal(patched.dueDate, "2027-01-01")
})
test("cliente antiguo omite tipo y mantiene compra al contado sin crear deuda", async () => {
  const f = await fixture(), headers = mobile(f)
  const { type, dueDate, initialPaymentCents, operationId, ...command } = input(f)
  const response = await fetch(base + "/api/purchases", { method: "POST", headers, body: JSON.stringify(command) }), result = await response.json()
  assert.equal(response.status, 201, JSON.stringify(result)); assert.equal(result.type, "CONTADO"); assert.equal(await db.accountPayable.count({ where: { accountId: f.account.id } }), 0)
  const edited = await fetch(base + "/api/purchases/" + result.id, { method: "PUT", headers, body: JSON.stringify({ ...command, items: [{ productId: f.product.id, qty: "2", unitCostCents: "5000" }] }) })
  const updated = await edited.json(); assert.equal(edited.status, 200, JSON.stringify(updated))
  assert.equal(updated.treasuryAccountId, null); assert.equal(updated.paymentMethod, null)
  assert.equal(await db.cashMovement.count({ where: { accountId: f.account.id } }), 0)
})
test("HTTP móvil con dispositivo de caja: consultar, abrir turno y pagar sin cookies de sesión web", async () => {
  const f = await fixture(), headers = mobile(f)
  const context = await fetch(base + "/api/cash-shifts", { headers })
  const deviceCookie = context.headers.get("set-cookie")?.split(";")[0]
  assert.ok(deviceCookie); headers.Cookie = deviceCookie
  let response = await fetch(base + "/api/cash-shifts?view=preview", { headers }); const preview = await response.json()
  const postCash = body => fetch(base + "/api/cash-shifts", { method: "POST", headers, body: JSON.stringify(body) })
  response = await postCash({ action: "activate", treasuryAccountId: f.box.id, countedCents: 0, previewToken: preview.previewToken }); assert.equal(response.status, 200, await response.text())
  response = await postCash({ action: "open", countedCents: 0 }); const opened = await response.json(); assert.equal(response.status, 200, JSON.stringify(opened))
  const command = input(f, { initialPaymentCents: 200000, paymentMethod: "EFECTIVO", treasuryAccountId: f.box.id, cashOperation: { accountId: f.account.id, userId: f.actor.id, clientOperationId: randomUUID(), cashShiftId: opened.data.id, clientSequence: 1 } })
  response = await fetch(base + "/api/purchases", { method: "POST", headers, body: JSON.stringify(command) }); const result = await response.json(); assert.equal(response.status, 201, JSON.stringify(result))
  assert.equal(result.balanceCents, 800000)
  assert.equal(await db.cashMovement.count({ where: { accountId: f.account.id, sourceType: "supplierPayment" } }), 1)
  response = await fetch(base + "/api/purchases", { method: "POST", headers, body: JSON.stringify(command) }); assert.equal(response.status, 201)
  assert.equal(await db.cashMovement.count({ where: { accountId: f.account.id, sourceType: "supplierPayment" } }), 1)
})
test("HTTP valida campos ausentes sin elegir otra deuda ni crear efectos parciales", async () => {
  const f = await fixture(), headers = mobile(f), p = await buy(f), ap = await getAP(f, p.id)
  for (const command of [payment(f, ap, { apId: undefined }), payment(f, ap, { amountCents: 2.5 }), payment(f, ap, { treasuryAccountId: "ajena" }), payment(f, ap, { note: 123 })]) {
    const response = await fetch(base + "/api/supplier-payments", { method: "POST", headers, body: JSON.stringify(command) }); assert.equal(response.status, 400, await response.text())
  }
  for (const items of [undefined, [], [null], [{ productId: f.product.id, qty: "2", unitCostCents: 10 }]]) {
    const response = await fetch(base + "/api/purchases", { method: "POST", headers, body: JSON.stringify(input(f, { items })) }); assert.equal(response.status, 400, await response.text())
  }
  assert.equal((await getAP(f, p.id)).balanceCents, 1000000)
  assert.equal(await db.supplierPayment.count({ where: { accountId: f.account.id } }), 0)
})
test("contrato OpenAPI referencia esquemas existentes y documenta los handlers entregados", () => {
  const spec = JSON.parse(fs.readFileSync(path.join(root, "docs/openapi-compras-credito.json"), "utf8"))
  const resolve = value => {
    if (!value || typeof value !== "object") return
    if (value.$ref) { const name = value.$ref.split("/").at(-1); assert.ok(spec.components.schemas[name], `Referencia inexistente: ${name}`) }
    Object.values(value).forEach(resolve)
  }
  resolve(spec)
  for (const [url, methods] of Object.entries(spec.paths)) {
    const filename = path.join(root, "src/app", url.replace(/^\//, "").replaceAll("{id}", "[id]"), "route.ts")
    assert.ok(fs.existsSync(filename), `Falta handler: ${url}`)
    const source = fs.readFileSync(filename, "utf8")
    for (const method of Object.keys(methods)) assert.match(source, new RegExp(`function ${method.toUpperCase()}\\(`), `Falta ${method} en ${url}`)
  }
})
test("revisión: una cuenta anulada no devuelve deuda, abonos ni atraso vigentes", async () => {
  const f = await fixture(), p = await buy(f, { dueDate: "2020-01-01" }), ap = await getAP(f, p.id)
  await scope(f, () => purchases.cancelPurchase(f.actor, p.id))
  const dto = await payments.getPayable(f.actor, ap.id)
  assert.equal(dto.balanceCents, 0); assert.equal(dto.paidCents, 0); assert.equal(dto.overdueDays, 0); assert.equal(dto.cancelled, true)
})
test("revisión: los reportes paginan la consulta sin perder totales ni resumen por proveedor", async () => {
  const f = await fixture()
  await db.purchase.createMany({ data: Array.from({ length: 53 }, () => ({ accountId: f.account.id, userId: f.actor.id, supplierId: f.supplier.id, supplierName: f.supplier.name, totalCents: 10000 })) })
  reportReads = []
  let first, second
  try {
    first = await reports.purchaseReport(f.actor, "purchases", { take: 5 })
    second = await reports.purchaseReport(f.actor, "purchases", { skip: 5, take: 5 })
    assert.ok(reportReads.every(query => query.take === 6), "JSON cargó todos los registros en vez de una página")
  } finally { reportReads = null }
  assert.equal(first.summary.count, 53); assert.equal(first.summary.totalCents, 530000)
  assert.equal(first.data.length, 5); assert.equal(first.nextSkip, 5)
  assert.ok(!first.data.some(row => second.data.some(other => other.id === row.id)))
  await buy(f); await buy(f)
  const apReport = await reports.purchaseReport(f.actor, "accounts-payable", { take: 1 })
  assert.equal(apReport.summary.balanceCents, 2000000); assert.equal(apReport.providers[0].balanceCents, 2000000)
  const exported = await reports.purchaseReport(f.actor, "purchases", { take: 1 }, true)
  assert.equal(exported.data.length, 55)
})
test("revisión HTTP: editar metadatos mal formados y precios que desbordan responde 400", async () => {
  const f = await fixture(), headers = mobile(f), p = await buy(f)
  for (const field of ["notes", "supplierName", "supplierId", "treasuryAccountId"]) {
    const response = await fetch(base + "/api/purchases/" + p.id, { method: "PUT", headers, body: JSON.stringify({ ...input(f), [field]: 123 }) })
    assert.equal(response.status, 400, `${field}: ${await response.text()}`)
  }
  const response = await fetch(base + "/api/purchases", { method: "POST", headers, body: JSON.stringify(input(f, { items: [{ productId: f.product.id, qty: 0.001, unitCostCents: 2147483647 }] })) })
  assert.equal(response.status, 400, await response.text())
  const state = await getAP(f, p.id); assert.equal(state.balanceCents, 1000000)
})
test("revisión: cambiar proveedor no reasigna el historial de pagos anulados", async () => {
  const f = await fixture(), p = await buy(f), ap = await getAP(f, p.id)
  await db.supplier.update({ where: { id: f.supplier.id }, data: { name: "Proveedor renombrado" } })
  await scope(f, () => purchases.updatePurchase(f.actor, { id: p.id, items: input(f).items, updateProductPrice: false }))
  assert.equal((await db.purchase.findUniqueOrThrow({ where: { id: p.id } })).supplierName, f.supplier.name)
  assert.equal((await payments.listPayables(f.actor, { query: f.supplier.name })).summary.count, 1)
  const paid = await scope(f, () => payments.addSupplierPayment(f.actor, payment(f, ap)))
  await scope(f, () => payments.cancelSupplierPayment(f.actor, paid.id, "Revisión de factura"))
  const other = await db.supplier.create({ data: { accountId: f.account.id, name: "Proveedor nuevo" } })
  await scope(f, () => purchases.updatePurchase(f.actor, { id: p.id, supplierId: other.id, items: input(f).items, updateProductPrice: false }))
  const oldReport = await reports.purchaseReport(f.actor, "supplier-payments", { supplierId: f.supplier.id, cancelled: "all" })
  assert.equal(oldReport.data.length, 1); assert.equal(oldReport.data[0].supplier, f.supplier.name)
  assert.equal((await reports.purchaseReport(f.actor, "supplier-payments", { supplierId: other.id, cancelled: "all" })).data.length, 0)
  const detail = await payments.getSupplierPayment(f.actor, paid.id)
  assert.equal(detail.supplierId, f.supplier.id); assert.equal(detail.supplierName, f.supplier.name)
  assert.equal((await getAP(f, p.id)).supplierId, other.id)
})
test("revisión: OCR conserva notas y calcula la tasa de venta del producto nuevo sin proveedor", async () => {
  const f = await fixture(), ocr = load("@/lib/purchase-ocr")
  const purchase = await scope(f, () => ocr.createPurchaseFromOCR(f.actor, { type: "CONTADO", supplierName: null, notes: "Nota de revisión OCR", products: [{ productId: null, sku: null, reference: null, description: "Sin proveedor OCR", quantity: 1, unitCostCents: 10000, createNew: true }] }))
  const product = await db.product.findFirstOrThrow({ where: { accountId: f.account.id, name: "Sin proveedor OCR" } })
  assert.equal(product.itbisRateBp, 1800); assert.equal(product.priceCents, 15340)
  assert.equal((await db.purchase.findUniqueOrThrow({ where: { id: purchase.id } })).notes, "Nota de revisión OCR")
})
test("revisión: excluir líneas OCR conserva descuentos por índice y redondeo por línea", () => {
  const review = load("@/lib/purchase-review"), pricing = load("@/lib/purchase-pricing")
  const products = [{ included: false, quantity: 1, unitPrice: 10000 }, { included: true, quantity: 0.5, unitPrice: 10000 }, { included: true, quantity: 0.333, unitPrice: 1 }, { included: true, quantity: 0.333, unitPrice: 1 }]
  const totals = review.summarizePurchaseReview(products, { 0: 0, 1: 5000 }, (p, discountPercentBp) => pricing.computePurchaseCostBreakdown({ unitCostCents: p.unitPrice, discountPercentBp, purchaseIncludesItbis: false }))
  assert.equal(totals.totalCents, 2500); assert.equal(totals.subtotalCents, 5000); assert.equal(totals.discountCents, 2500)
})
after(async () => {
  await new Promise(resolve => server.close(resolve))
  // Se conserva la base local para inspección; no se borra información fuera de los fixtures.
  await db.$disconnect()
})
