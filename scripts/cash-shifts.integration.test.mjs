// Seguridad: nunca usar DATABASE_URL como alternativa. Esta suite solo acepta una base desechable local explícita.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { PrismaClient } from "@prisma/client"

if (!process.env.TEST_DATABASE_URL) throw new Error("Define TEST_DATABASE_URL con una base desechable local; nunca se usa DATABASE_URL")
const testUrl = new URL(process.env.TEST_DATABASE_URL)
if (!["127.0.0.1", "localhost"].includes(testUrl.hostname) || !/cash_test/.test(testUrl.pathname)) throw new Error("Las pruebas de caja requieren una base local cuyo nombre contenga cash_test")
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
after(() => db.$disconnect())
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const cache = new Map()
const testGlobal = { prisma: db }
function load(name) {
  if (name === "@prisma/client") return { ...require(name), PrismaClient: class { constructor() { throw new Error("Las pruebas prohíben clientes implícitos; usar exclusivamente la conexión local explícita") } } }
  if (name === "next/headers") return { headers: async () => new Headers() }
  if (name === "next/cache") return { revalidatePath() {} }
  if (name === "@/lib/auth") return { getCurrentUser: async () => load("@/lib/cash-context").cashRequest.getStore()?.trustedActor ?? null, getCurrentUserWithDiagnostics: async () => ({ user: load("@/lib/cash-context").cashRequest.getStore()?.trustedActor ?? null }), AuthenticationRequiredError: Error }
  if (name === "../_helpers/auth") return { getCurrentUserFromRequest: async () => load("@/lib/cash-context").cashRequest.getStore()?.trustedActor ?? null }
  if (name === "@/lib/error-logger") return { logError: async () => {}, ErrorCodes: {} }
  if (name === "@/lib/openai") return { openai: {} }
  if (!name.startsWith("@/")) return require(name)
  if (cache.has(name)) return cache.get(name)
  const filename = path.join(root, "src", name.slice(2) + ".ts")
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}; cache.set(name, exports)
  vm.runInNewContext(compiled, { exports, require: load, console: { ...console, log() {} }, Date, Map, Set, process, Headers, globalThis: testGlobal }, { filename })
  return exports
}
const service = load("@/lib/cash-shifts")
const engine = load("@/lib/cash-financial-db")
const { cashRequest, withCashOperation } = load("@/lib/cash-context")
const money = load("@/lib/cash-money")
assert.equal(load("@/lib/db").getRawPrismaClient(), db)
const device = "integration-device"
async function fixture(activate = true) {
  const id = `cash-${randomUUID()}`
  const account = await db.account.create({ data: { name: "Pruebas caja", clerkUserId: id } })
  const actor = await db.user.create({ data: { accountId: account.id, name: "Ana", username: "ana", passwordHash: "test-only", isOwner: true, canOperateCashShifts: true, canManageCashShifts: true, canViewAllCashShifts: true, canCreateTreasuryTransfers: true, canAccessSales: true } })
  const box = await db.treasuryAccount.create({ data: { accountId: account.id, name: "Caja", type: "CAJA", createdByUserId: actor.id } })
  const bank = await db.treasuryAccount.create({ data: { accountId: account.id, name: "Banco", type: "BANCO", createdByUserId: actor.id } })
  await db.treasuryOpeningBalance.createMany({ data: [{ accountId: account.id, treasuryAccountId: box.id, amountCents: 100000, effectiveAt: new Date() }, { accountId: account.id, treasuryAccountId: bank.id, amountCents: 300000, effectiveAt: new Date() }] })
  const f = { account, actor, box, bank }
  if (activate) { await enable(f); f.shift = await service.openCashShift(actor, device, 100000) }
  return f
}
async function enable(f) {
  const preview = await service.previewCashActivation(f.actor)
  await service.activateCashControl(f.actor, { treasuryAccountId: f.box.id, countedCents: 100000, previewToken: preview.previewToken })
}
function saleData(f, extra = {}) {
  const code = randomUUID()
  return { accountId: f.account.id, userId: f.actor.id, invoiceCode: code, invoiceNumber: Math.floor(Math.random() * 1000000), type: "CONTADO", paymentMethod: "EFECTIVO", treasuryAccountId: f.box.id, subtotalCents: 10000, itbisCents: 0, totalCents: 10000, ...extra }
}
function transact(f, callback, extra = {}) {
  return cashRequest.run({ trustedActor: f.actor, deviceHash: device, ...extra }, () => engine.runCashTransaction(db, callback, { timeout: 15000 }))
}
function operation(f, sequence, callback, operationId = randomUUID(), payload = { sequence }) {
  const input = { cashShiftId: f.shift.id, clientOperationId: operationId, clientSequence: sequence, accountId: f.account.id, userId: f.actor.id }
  return cashRequest.run({ trustedActor: f.actor, deviceHash: device }, () => withCashOperation(input, payload, () => engine.runCashTransaction(db, callback, { timeout: 15000 })))
}
function globalOperation(f, callback, id = randomUUID()) {
  const input = { cashShiftId: null, clientSequence: null, clientOperationId: id, accountId: f.account.id, userId: f.actor.id }
  return cashRequest.run({ trustedActor: f.actor, deviceHash: "other-device" }, () => withCashOperation(input, { kind: "bank" }, () => engine.runCashTransaction(db, callback, { timeout: 15000 })))
}
async function expected(f) { return (await service.getCashContext(f.actor, device)).activeShift.expectedCashCents }
async function close(f, sequence, counted, note) {
  await service.prepareCashClose(f.actor, device, f.shift.id, sequence)
  return service.finishCashClose(f.actor, device, f.shift.id, { countedCents: counted, expectedCents: await expected(f), note })
}

test("Migración aditiva conserva usuarios y asigna permisos equivalentes", async () => {
  const users = await db.user.findMany({ where: { accountId: "cash-migration-test" }, orderBy: { username: "asc" } })
  assert.equal(users.length, 3)
  const owner = users.find(u => u.isOwner), cashier = users.find(u => u.username === "cashier"), reader = users.find(u => u.username === "reader")
  assert.equal(owner.canManageCashShifts, true); assert.equal(cashier.canOperateCashShifts, true)
  assert.equal(owner.canRecordCashMovements, true); assert.equal(cashier.canRecordCashMovements, false)
  assert.equal(cashier.canManageCashShifts, false); assert.equal(reader.canViewAllCashShifts, true)
  assert.equal(await db.cashControl.count({ where: { accountId: "cash-migration-test" } }), 0)
})
test("Sin activar, una venta conserva su contrato y no genera asientos ni turnos", async () => {
  const f = await fixture(false)
  const sale = await transact(f, tx => tx.sale.create({ data: saleData(f) }))
  assert.ok(sale.id)
  assert.equal(await db.cashMovement.count({ where: { accountId: f.account.id } }), 0)
  assert.equal((await service.getCashContext(f.actor, device)).enabled, false)
})
test("Apertura no duplica fondos y los saldos de banco sobreviven a la activación", async () => {
  const f = await fixture()
  assert.equal(await expected(f), 100000)
  assert.equal(await service.drawerBalance(db, f.account.id, f.box.id), 100000)
  assert.equal(await service.drawerBalance(db, f.account.id, f.bank.id), 300000)
})
test("Reintentos y envíos simultáneos de la misma operación confirman una sola venta", async () => {
  const f = await fixture(), id = randomUUID()
  let calls = 0
  const callback = async tx => { calls++; return tx.sale.create({ data: saleData(f) }) }
  const [first, second] = await Promise.all([operation(f, 1, callback, id), operation(f, 1, callback, id)])
  assert.equal(calls, 1); assert.equal(first.id, second.id)
  assert.ok(second.soldAt instanceof Date)
  assert.equal(await expected(f), 110000)
  assert.equal(await db.sale.count({ where: { accountId: f.account.id } }), 1)
})
test("Un ID reutilizado con otro contenido se rechaza sin duplicar efectos", async () => {
  const f = await fixture(), id = randomUUID()
  await operation(f, 1, tx => tx.sale.create({ data: saleData(f) }), id)
  await assert.rejects(operation(f, 1, tx => tx.sale.create({ data: saleData(f) }), id, { different: true }), /identificador/)
  assert.equal(await expected(f), 110000)
})
test("Pago dividido separa efectivo y banco; crédito no genera caja", async () => {
  const f = await fixture()
  await operation(f, 1, tx => tx.sale.create({ data: saleData(f, { paymentMethod: null, treasuryAccountId: null, payments: { create: [{ method: "EFECTIVO", amountCents: 4000, treasuryAccountId: f.box.id }, { method: "TARJETA", amountCents: 6000, treasuryAccountId: f.bank.id }] } }) }))
  await operation(f, 2, tx => tx.sale.create({ data: saleData(f, { type: "CREDITO", paymentMethod: null, treasuryAccountId: null }) }))
  assert.equal(await expected(f), 104000)
  assert.equal(await service.drawerBalance(db, f.account.id, f.bank.id), 306000)
  assert.equal(await db.cashSourceLink.count({ where: { cashShiftId: f.shift.id } }), 2)
  const context = await service.getCashContext(f.actor, device)
  assert.equal(context.breakdown.find(item => item.accountName === "Banco").totalCents, 6000)
  await close(f, 2, 104000)
  const saved = await db.cashShift.findUnique({ where: { id: f.shift.id } })
  const summary = money.snapshotSalesSummary(saved.closingSnapshot.documents)
  assert.equal(summary.cashSalesCents, 10000); assert.equal(summary.creditSalesCents, 10000)
})
test("Cobros por método coinciden con la instantánea y excluyen movimientos de tesorería", async () => {
  const f = await fixture()
  const secondBank = await db.treasuryAccount.create({ data: { accountId: f.account.id, name: "Otro banco", type: "BANCO" } })
  const customer = await db.customer.create({ data: { accountId: f.account.id, name: "Cliente", visualId: 2 } })
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f, { customerId: customer.id, paymentMethod: null, treasuryAccountId: null, payments: { create: [{ method: "EFECTIVO", amountCents: 4000, treasuryAccountId: f.box.id }, { method: "TARJETA", amountCents: 6000, treasuryAccountId: f.bank.id }] } }) }))
  await operation(f, 2, tx => tx.sale.create({ data: saleData(f, { paymentMethod: "TARJETA", treasuryAccountId: secondBank.id }) }))
  await operation(f, 3, tx => tx.sale.create({ data: saleData(f, { paymentMethod: "TRANSFERENCIA", treasuryAccountId: f.bank.id }) }))
  await operation(f, 4, tx => tx.sale.create({ data: saleData(f, { paymentMethod: "OTRO", treasuryAccountId: f.bank.id }) }))
  const credit = await operation(f, 5, tx => tx.sale.create({ data: saleData(f, { type: "CREDITO", paymentMethod: null, treasuryAccountId: null }) }))
  const ar = await db.accountReceivable.create({ data: { saleId: credit.id, customerId: customer.id, totalCents: 10000, balanceCents: 10000 } })
  await operation(f, 6, tx => tx.payment.create({ data: { arId: ar.id, userId: f.actor.id, amountCents: 2500, method: "TRANSFERENCIA", treasuryAccountId: f.bank.id, receiptNumber: 1, receiptCode: "R-cobros" } }))
  await operation(f, 7, async tx => {
    await tx.operatingExpense.create({ data: { accountId: f.account.id, userId: f.actor.id, description: "Gasto", amountCents: 1000, treasuryAccountId: f.box.id, paymentMethod: "EFECTIVO" } })
    await tx.purchase.create({ data: { accountId: f.account.id, userId: f.actor.id, totalCents: 2000, paymentMethod: "TRANSFERENCIA", treasuryAccountId: f.bank.id } })
    await tx.return.create({ data: { accountId: f.account.id, userId: f.actor.id, saleId: sale.id, returnCode: "D-cobros", returnNumber: 1, subtotalCents: 500, itbisCents: 0, totalCents: 500, refundMethod: "TARJETA", refundTreasuryAccountId: f.bank.id } })
  })
  await service.manualCashMovement(f.actor, device, { shiftId: f.shift.id, operationId: randomUUID(), kind: "OWNER_IN", amountCents: 5000, note: "Fondo adicional" })
  await service.manualCashMovement(f.actor, device, { shiftId: f.shift.id, operationId: randomUUID(), kind: "TRANSFER_OUT", amountCents: 25000, otherAccountId: f.bank.id, note: "Depósito" })
  const context = await service.getCashContext(f.actor, device)
  assert.deepEqual(JSON.parse(JSON.stringify(context.collectionsByMethod)), [{ method: "EFECTIVO", totalCents: 4000 }, { method: "TARJETA", totalCents: 16000 }, { method: "TRANSFERENCIA", totalCents: 12500 }, { method: "OTRO", totalCents: 10000 }])
  assert.equal(context.activeShift.expectedCashCents, 83000)
  const report = await service.getCashShiftReport(f.actor, device, f.shift.id)
  assert.equal(report.format, "CARTA"); assert.equal(report.expectedCashCents, 83000)
  const splitMovements = report.movements.filter(row => row.sourceType === "sale" && row.sourceId === sale.id)
  assert.equal(splitMovements.length, 2)
  assert.ok(splitMovements.every(row => row.customerName === "Cliente"))
  assert.ok(report.movements.some(row => row.sourceType === "payment" && row.customerName === "Cliente"))
  assert.ok(report.movements.some(row => row.sourceType === "return" && row.customerName === "Cliente"))
  assert.equal(report.movements.filter(row => row.sourceType === "treasuryTransfer").length, 2)
  assert.ok(report.movements.some(row => row.sourceType === "return" && row.amountCents === -500))
  assert.ok(report.documents.some(row => row.id === credit.id && row.sourceType === "sale"))
  assert.equal(report.confirmedOperationIds.length, 9)
  assert.deepEqual(money.shiftCollectionsByMethod(report.movements), context.collectionsByMethod)
  await db.companySettings.create({ data: { accountId: f.account.id, name: "Comercio", phone: "", address: "", shiftReportPrintFormat: "80mm" } })
  assert.equal((await service.getCashShiftReport(f.actor, device, f.shift.id)).format, "80mm")
  await assert.rejects(service.getCashShiftReport(f.actor, "other-device", f.shift.id), /usuario y dispositivo/)
  await assert.rejects(service.getCashShiftReport({ ...f.actor, id: "other-user", isOwner: false }, device, f.shift.id), /usuario y dispositivo/)
  await close(f, 7, 83000)
  const saved = await service.getCashReceipt(f.actor, f.shift.id)
  assert.deepEqual(money.shiftCollectionsByMethod(saved.closingSnapshot.movements), context.collectionsByMethod)
})

test("Resumen vacío y permisos no inventan ni filtran cobros de otro responsable", async () => {
  const f = await fixture()
  const own = await service.getCashContext(f.actor, device)
  assert.equal(own.collectionsByMethod.length, 3)
  assert.ok(own.collectionsByMethod.every(item => item.totalCents === 0))
  const other = { ...f.actor, id: "other-cashier", isOwner: false, canManageCashShifts: false, canViewAllCashShifts: false }
  const hidden = await service.getCashContext(other, device)
  assert.equal(hidden.collectionsByMethod, null)
  assert.equal(hidden.breakdown.length, 0)
  const otherAccount = await fixture(false)
  assert.equal((await service.getCashContext(otherAccount.actor, device)).collectionsByMethod, null)
})

test("Abonos de crédito se registran una vez, por su cuenta y turno", async () => {
  const f = await fixture()
  const customer = await db.customer.create({ data: { accountId: f.account.id, name: "Cliente", visualId: 2 } })
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f, { type: "CREDITO", paymentMethod: null, treasuryAccountId: null }) }))
  const ar = await db.accountReceivable.create({ data: { saleId: sale.id, customerId: customer.id, totalCents: 10000, balanceCents: 10000 } })
  const id = randomUUID(), add = tx => tx.payment.create({ data: { arId: ar.id, userId: f.actor.id, amountCents: 2500, method: "EFECTIVO", treasuryAccountId: f.box.id, receiptNumber: 1, receiptCode: "R-1" } })
  await operation(f, 2, add, id); await operation(f, 2, add, id)
  assert.equal(await expected(f), 102500)
  assert.equal(await db.payment.count({ where: { arId: ar.id } }), 1)
})
test("Gastos y compras pagados salen de su cuenta; mercancía sin pago no sale de caja", async () => {
  const f = await fixture()
  await operation(f, 1, async tx => {
    await tx.operatingExpense.create({ data: { accountId: f.account.id, userId: f.actor.id, description: "Gasto caja", amountCents: 1000, treasuryAccountId: f.box.id, paymentMethod: "EFECTIVO" } })
    await tx.operatingExpense.create({ data: { accountId: f.account.id, userId: f.actor.id, description: "Gasto banco", amountCents: 3000, treasuryAccountId: f.bank.id, paymentMethod: "TRANSFERENCIA" } })
    await tx.purchase.create({ data: { accountId: f.account.id, userId: f.actor.id, totalCents: 2000, treasuryAccountId: f.box.id, paymentMethod: "EFECTIVO" } })
    await tx.purchase.create({ data: { accountId: f.account.id, userId: f.actor.id, totalCents: 9000 } })
  })
  assert.equal(await expected(f), 97000)
  assert.equal(await service.drawerBalance(db, f.account.id, f.bank.id), 297000)
})
test("Anular gasto abierto conserva evidencia y repone solo su salida original", async () => {
  const f = await fixture()
  const expense = await operation(f, 1, tx => tx.operatingExpense.create({ data: { accountId: f.account.id, userId: f.actor.id, description: "Gasto", amountCents: 1000, treasuryAccountId: f.box.id, paymentMethod: "EFECTIVO" } }))
  await transact(f, tx => tx.operatingExpense.delete({ where: { id: expense.id } }))
  assert.ok((await db.operatingExpense.findUnique({ where: { id: expense.id } })).cancelledAt)
  assert.equal((await transact(f, tx => tx.operatingExpense.findMany({ where: { accountId: f.account.id } }))).length, 0)
  assert.equal(await expected(f), 100000)
})
test("Editar pagos divididos mantiene el saldo final sin sumar dos veces", async () => {
  const f = await fixture()
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f, { paymentMethod: null, treasuryAccountId: null, payments: { create: [{ method: "EFECTIVO", amountCents: 10000, treasuryAccountId: f.box.id }] } }) }))
  await transact(f, async tx => {
    await tx.salePayment.deleteMany({ where: { saleId: sale.id } })
    await tx.sale.updateMany({ where: { id: sale.id }, data: { totalCents: 12000 } })
    await tx.salePayment.createMany({ data: [{ saleId: sale.id, method: "EFECTIVO", treasuryAccountId: f.box.id, amountCents: 7000 }, { saleId: sale.id, method: "TARJETA", treasuryAccountId: f.bank.id, amountCents: 5000 }] })
  })
  assert.equal(await expected(f), 107000)
  assert.equal(await service.drawerBalance(db, f.account.id, f.bank.id), 305000)
})
test("Fallos de caja revierten también otros cambios de la transacción", async () => {
  const f = await fixture()
  await assert.rejects(operation(f, 1, async tx => {
    await tx.invoiceSequence.create({ data: { accountId: f.account.id, series: "T", lastNumber: 9 } })
    return tx.sale.create({ data: saleData(f, { paymentMethod: "TARJETA", treasuryAccountId: f.box.id }) })
  }), /cuenta bancaria/)
  assert.equal(await db.invoiceSequence.count({ where: { accountId: f.account.id } }), 0)
  assert.equal(await db.sale.count({ where: { accountId: f.account.id } }), 0)
  assert.equal(await expected(f), 100000)
})
test("Cliente antiguo, otro usuario y otro dispositivo no pueden usar la caja", async () => {
  const f = await fixture()
  await assert.rejects(transact(f, tx => tx.sale.create({ data: saleData(f) })), /cliente actualizado/)
  await assert.rejects(transact(f, tx => tx.operatingExpense.create({ data: { accountId: f.account.id, userId: f.actor.id, description: "No", amountCents: 100, treasuryAccountId: f.box.id, paymentMethod: "EFECTIVO" } }), { deviceHash: "another" }), /responsable/)
  const intruder = await fixture()
  await assert.rejects(transact(intruder, tx => tx.operatingExpense.create({ data: { accountId: f.account.id, userId: intruder.actor.id, description: "No", amountCents: 100, treasuryAccountId: f.box.id, paymentMethod: "EFECTIVO" } })), /otro negocio/)
  assert.equal(await expected(f), 100000)
})
test("Dos aperturas simultáneas dejan exactamente un turno activo", async () => {
  const f = await fixture(false); await enable(f)
  const results = await Promise.allSettled([service.openCashShift(f.actor, device, 100000), service.openCashShift(f.actor, "another", 100000)])
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1)
  assert.equal(await db.cashShift.count({ where: { accountId: f.account.id, status: "OPEN" } }), 1)
})
test("Preparar cierre permite pendientes anteriores y rechaza ventas nuevas", async () => {
  const f = await fixture()
  await service.prepareCashClose(f.actor, device, f.shift.id, 1)
  await assert.rejects(service.finishCashClose(f.actor, device, f.shift.id, { countedCents: 100000, expectedCents: 100000 }), /pendientes/)
  const id = randomUUID(), callback = tx => tx.sale.create({ data: saleData(f) })
  const sale = await operation(f, 1, callback, id)
  await assert.rejects(operation(f, 2, callback), /cerrando/)
  await service.finishCashClose(f.actor, device, f.shift.id, { countedCents: 110000, expectedCents: 110000 })
  assert.equal((await operation(f, 1, callback, id)).id, sale.id)
  await assert.rejects(operation(f, 2, callback), /Abre un turno/)
})
test("El cierre excepcional exige dueño y motivo, conserva diferencias y no reasigna pendientes", async () => {
  const f = await fixture(), id = randomUUID(), oldShift = f.shift
  const create = tx => tx.sale.create({ data: saleData(f) })
  const original = await operation(f, 1, create, id)
  await service.prepareCashClose(f.actor, device, oldShift.id, 2)
  const input = { emergency: true, countedCents: 109000, expectedCents: 110000, note: "Responsable ausente; revisar ventas pendientes en su dispositivo" }
  await assert.rejects(service.finishCashClose({ ...f.actor, isOwner: false }, "owner-device", oldShift.id, input), /permiso/)
  await assert.rejects(service.finishCashClose(f.actor, "owner-device", oldShift.id, { ...input, note: "" }), /motivo/)
  await assert.rejects(service.finishCashClose(f.actor, "owner-device", oldShift.id, { ...input, expectedCents: 100000 }), /cambió/)
  await service.finishCashClose(f.actor, "owner-device", oldShift.id, input)
  const saved = await db.cashShift.findUnique({ where: { id: oldShift.id } })
  assert.equal(saved.status, "CLOSED"); assert.equal(saved.closingDifferenceCents, -1000)
  assert.equal(saved.closingSnapshot.emergency, true); assert.equal(saved.closingNote, input.note)
  assert.equal(await service.drawerBalance(db, f.account.id, f.box.id), 109000)
  const audit = await db.auditLog.findFirst({ where: { accountId: f.account.id, resourceType: "CashShift", resourceId: oldShift.id, details: { path: ["event"], equals: "SHIFT_EMERGENCY_CLOSED" } } })
  assert.ok(audit)
  await assert.rejects(operation(f, 2, create), /Abre un turno/)
  f.shift = await service.openCashShift(f.actor, device, 109000)
  const old = { ...f, shift: oldShift }
  assert.equal((await operation(old, 1, create, id)).id, original.id)
  await assert.rejects(operation(old, 2, create), /Sincroniza los pendientes anteriores/)
  assert.equal(await db.sale.count({ where: { accountId: f.account.id } }), 1)
  assert.equal(await expected(f), 109000)
})
test("Faltante del saliente no se traslada al siguiente; recepción queda separada", async () => {
  const f = await fixture()
  await operation(f, 1, tx => tx.sale.create({ data: saleData(f) }))
  await close(f, 1, 109000, "Faltan diez pesos")
  const original = await db.cashShift.findUnique({ where: { id: f.shift.id } })
  assert.equal(original.closingDifferenceCents, -1000)
  const next = await service.openCashShift(f.actor, device, 108500, "Se recibió menos de lo entregado")
  const incoming = await db.cashShift.findUnique({ where: { id: next.id } })
  assert.equal(incoming.openingExpectedCents, 109000)
  assert.equal(incoming.openingDifferenceCents, -500)
  assert.equal(await expected(f), 108500)
  assert.equal(await service.drawerBalance(db, f.account.id, f.box.id), 108500)
})
test("Un cierre es estable y las correcciones documentales no inventan salidas", async () => {
  const f = await fixture()
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f) }))
  await close(f, 1, 110000)
  const saved = (await db.cashShift.findUnique({ where: { id: f.shift.id } })).closingSnapshot
  await assert.rejects(transact(f, tx => tx.sale.update({ where: { id: sale.id }, data: { totalCents: 999 } })), /pertenece a un cierre/)
  f.shift = await service.openCashShift(f.actor, device, 110000)
  await transact(f, tx => tx.sale.update({ where: { id: sale.id }, data: { cancelledAt: new Date() } }), { correction: { sourceType: "sale", sourceId: sale.id, moneyMoved: false, reason: "Corrección documental" } })
  assert.equal(await expected(f), 110000)
  const closed = await db.cashShift.findFirst({ where: { accountId: f.account.id, status: "CLOSED" } })
  assert.deepEqual(closed.closingSnapshot, saved)
})
test("Reverso real posterior afecta el turno actual y conserva el anterior", async () => {
  const f = await fixture()
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f) }))
  await close(f, 1, 110000)
  f.shift = await service.openCashShift(f.actor, device, 110000)
  await transact(f, tx => tx.sale.update({ where: { id: sale.id }, data: { cancelledAt: new Date() } }), { correction: { sourceType: "sale", sourceId: sale.id, moneyMoved: true, reason: "Se devolvió el dinero" } })
  assert.equal(await expected(f), 100000)
  assert.equal((await db.cashShift.findFirst({ where: { accountId: f.account.id, status: "CLOSED" } })).countedClosingCents, 110000)
})
test("Traspaso mueve ambas cuentas una vez y el cierre ya no incluye lo retirado", async () => {
  const f = await fixture(), input = { shiftId: f.shift.id, operationId: randomUUID(), kind: "TRANSFER_OUT", amountCents: 25000, otherAccountId: f.bank.id, note: "Depósito" }
  await service.manualCashMovement(f.actor, device, input); await service.manualCashMovement(f.actor, device, input)
  assert.equal(await expected(f), 75000)
  assert.equal(await service.drawerBalance(db, f.account.id, f.bank.id), 325000)
  await close(f, 0, 75000)
})

test("Reversar un traspaso del turno abierto recupera el efectivo una sola vez", async () => {
  const f = await fixture()
  await service.manualCashMovement(f.actor, device, { shiftId: f.shift.id, operationId: randomUUID(), kind: "TRANSFER_OUT", amountCents: 25000, otherAccountId: f.bank.id, note: "Depósito" })
  const original = await db.treasuryTransfer.findFirst({ where: { accountId: f.account.id } })
  const treasury = load("@/app/(app)/treasury/actions")
  const call = (actor = f.actor, deviceHash = device) => cashRequest.run({ trustedActor: actor, deviceHash }, () => treasury.reverseTreasuryTransfer({ transferId: original.id, reason: "Depósito no realizado" }))
  await assert.rejects(call({ ...f.actor, isOwner: false, canReverseTreasuryTransfers: false }), /permiso/)
  await assert.rejects(call(f.actor, "other-device"), /responsable/)
  await assert.rejects(transact(f, tx => tx.treasuryTransfer.create({ data: { accountId: f.account.id, fromTreasuryAccountId: f.bank.id, toTreasuryAccountId: f.box.id, amountCents: 1, createdByUserId: f.actor.id, reversesTransferId: original.id } })), /exactamente/)
  await service.prepareCashClose(f.actor, device, f.shift.id, 0)
  await assert.rejects(call(), /cerrando/)
  assert.equal(await db.treasuryTransfer.count({ where: { reversesTransferId: original.id } }), 0)
  await service.cancelCashClose(f.actor, device, f.shift.id)
  await call()
  assert.equal(await expected(f), 100000)
  assert.equal(await service.drawerBalance(db, f.account.id, f.bank.id), 300000)
  await assert.rejects(call, /reversada/)
  assert.equal(await db.treasuryTransfer.count({ where: { accountId: f.account.id, reversesTransferId: original.id } }), 1)
})

test("Corregir un traspaso cerrado respeta permiso de reverso y movimiento real o documental", async () => {
  for (const moneyMoved of [true, false]) {
    const f = await fixture()
    await service.manualCashMovement(f.actor, device, { shiftId: f.shift.id, operationId: randomUUID(), kind: "TRANSFER_OUT", amountCents: 25000, otherAccountId: f.bank.id, note: "Depósito" })
    const original = await db.treasuryTransfer.findFirst({ where: { accountId: f.account.id } })
    await close(f, 0, 75000)
    const oldId = f.shift.id, snapshot = (await db.cashShift.findUnique({ where: { id: oldId } })).closingSnapshot
    f.actor = { ...f.actor, isOwner: false, canCreateTreasuryTransfers: false, canReverseTreasuryTransfers: true }
    f.shift = await service.openCashShift(f.actor, device, 75000)
    const treasury = load("@/app/(app)/treasury/actions")
    await assert.rejects(cashRequest.run({ trustedActor: f.actor, deviceHash: device }, () => treasury.reverseTreasuryTransfer({ transferId: original.id, reason: "Sin flujo de corrección" })), /pertenece a un cierre/)
    assert.equal(await db.treasuryTransfer.count({ where: { reversesTransferId: original.id } }), 0)
    assert.equal(await expected(f), 75000)
    await cashRequest.run({ trustedActor: f.actor, deviceHash: device }, () => service.correctClosedCashDocument(f.actor, device, { sourceType: "treasuryTransfer", sourceId: original.id, reason: "Corrección de depósito", moneyMoved }))
    assert.equal(await expected(f), moneyMoved ? 100000 : 75000)
    assert.equal(await service.drawerBalance(db, f.account.id, f.bank.id), moneyMoved ? 300000 : 325000)
    assert.deepEqual((await db.cashShift.findUnique({ where: { id: oldId } })).closingSnapshot, snapshot)
    assert.equal((await db.treasuryTransfer.findUnique({ where: { id: original.id } })).status, "REVERSED")
  }
})
test("Fondo manual, desactivación de responsable y cuenta controlada están protegidos", async () => {
  const f = await fixture()
  await assert.rejects(transact(f, tx => tx.treasuryOpeningBalance.create({ data: { accountId: f.account.id, treasuryAccountId: f.box.id, effectiveAt: new Date(), amountCents: 200000 } })), /fondo de caja/)
  await assert.rejects(transact(f, tx => tx.user.update({ where: { id: f.actor.id }, data: { isActive: false } })), /Cierra el turno/)
  await assert.rejects(transact(f, tx => tx.treasuryAccount.update({ where: { id: f.box.id }, data: { type: "BANCO" } })), /permanecer activa/)
  await assert.rejects(service.disableCashControl(f.actor), error => error.code === "CASH_CONTROL_IRREVERSIBLE" && error.status === 409)
})
test("La API prohíbe volver a Turno único con turnos abiertos, cerrándose y cerrados, incluso al dueño", async () => {
  const f = await fixture()
  const route = load("@/app/api/cash-shifts/route")
  const { NextRequest } = require("next/server")
  for (const status of ["OPEN", "CLOSING", "CLOSED"]) {
    if (status === "CLOSING") await service.prepareCashClose(f.actor, device, f.shift.id, 0)
    if (status === "CLOSED") await close(f, 0, 100000)
    assert.equal((await db.cashShift.findUnique({ where: { id: f.shift.id } })).status, status)
    const before = await db.cashControl.findUnique({ where: { accountId: f.account.id } })
    const shift = await db.cashShift.findUnique({ where: { id: f.shift.id } })
    const movements = await db.cashMovement.findMany({ where: { accountId: f.account.id }, orderBy: { id: "asc" } })
    const response = await cashRequest.run({ trustedActor: f.actor }, () => route.POST(new NextRequest("http://localhost/api/cash-shifts", { method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ action: "disable" }) })))
    assert.equal(response.status, 409)
    assert.equal((await response.json()).code, "CASH_CONTROL_IRREVERSIBLE")
    assert.deepEqual(await db.cashControl.findUnique({ where: { accountId: f.account.id } }), before)
    assert.deepEqual(await db.cashShift.findUnique({ where: { id: f.shift.id } }), shift)
    assert.deepEqual(await db.cashMovement.findMany({ where: { accountId: f.account.id }, orderBy: { id: "asc" } }), movements)
    assert.equal(await db.auditLog.count({ where: { accountId: f.account.id, details: { path: ["event"], equals: "CONTROL_DISABLED" } } }), 0)
  }
})
test("Las cuentas antiguas desactivadas conservan su registro y sus cierres protegidos", async () => {
  const f = await fixture()
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f) }))
  await close(f, 1, 110000)
  // Simular datos anteriores a la regla permanente; la API ya no permite generar este estado.
  await db.cashControl.update({ where: { accountId: f.account.id }, data: { enabled: false } })
  await service.disableCashControl(f.actor)
  assert.equal((await service.getCashContext(f.actor, device)).enabled, false)
  await transact(f, tx => tx.sale.create({ data: saleData(f) }))
  assert.equal(await service.drawerBalance(db, f.account.id, f.box.id), 120000)
  await assert.rejects(transact(f, tx => tx.sale.delete({ where: { id: sale.id } })), /pertenece a un cierre/)
})
test("Validación monetaria y permisos no admiten coerciones ni bypass por ADMIN", async () => {
  assert.throws(() => money.cents("100"), /monto válido/)
  assert.throws(() => money.cents(0.5), /monto válido/)
  assert.throws(() => money.difference(100, 90), /explicar/)
  const f = await fixture(false)
  await assert.rejects(service.previewCashActivation({ ...f.actor, isOwner: false, role: "ADMIN", canManageCashShifts: false }), /permiso/)
})
test("Devoluciones descuentan la cuenta del reembolso, no la de la venta original", async () => {
  const f = await fixture()
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f) }))
  await operation(f, 2, async tx => {
    await tx.return.create({ data: { accountId: f.account.id, userId: f.actor.id, saleId: sale.id, returnCode: "D-1", returnNumber: 1, subtotalCents: 4000, itbisCents: 0, totalCents: 4000, refundMethod: "EFECTIVO", refundTreasuryAccountId: f.box.id } })
    await tx.return.create({ data: { accountId: f.account.id, userId: f.actor.id, saleId: sale.id, returnCode: "D-2", returnNumber: 2, subtotalCents: 6000, itbisCents: 0, totalCents: 6000, refundMethod: "TRANSFERENCIA", refundTreasuryAccountId: f.bank.id } })
  })
  assert.equal(await expected(f), 106000)
  assert.equal(await service.drawerBalance(db, f.account.id, f.bank.id), 294000)
})
test("Cruzar medianoche y cambiar fecha del documento no reasigna su turno", async () => {
  const f = await fixture()
  await db.cashShift.update({ where: { id: f.shift.id }, data: { openedAt: new Date(Date.now() - 86400000) } })
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f, { soldAt: new Date(Date.now() - 43200000) }) }))
  const link = await db.cashSourceLink.findUnique({ where: { accountId_sourceType_sourceId: { accountId: f.account.id, sourceType: "sale", sourceId: sale.id } } })
  assert.equal(link.cashShiftId, f.shift.id)
  assert.equal(await expected(f), 110000)
})
test("Tesorería inicia el registro con su base y evita duplicar documentos históricos", async () => {
  const f = await fixture()
  await operation(f, 1, tx => tx.sale.create({ data: saleData(f) }))
  const treasury = load("@/lib/cash-treasury")
  const legacy = { from: new Date(0), to: new Date(), accounts: [], movements: [{ id: "old-opening", occurredAt: new Date(0), amountCents: 100000, direction: "IN" }], totals: {} }
  const result = await treasury.cashLedgerDashboard(f.account.id, new Date(0), new Date(), legacy, true)
  assert.equal(result.accounts.find(a => a.id === f.box.id).balanceCents, 110000)
  assert.equal(result.accounts.find(a => a.id === f.bank.id).balanceCents, 300000)
  assert.equal(result.movements.filter(m => m.source === "SALE_CASH").length, 1)
  assert.equal(result.movements.filter(m => m.source === "BASELINE").length, 2)
  assert.equal(result.movements.some(m => m.id === "old-opening"), false)
  assert.equal(result.totals.inCents, 10000)
})
test("Una revisión desactualizada y una operación futura bloquean la activación", async () => {
  const f = await fixture(false)
  const preview = await service.previewCashActivation(f.actor)
  await db.treasuryOpeningBalance.create({ data: { accountId: f.account.id, treasuryAccountId: f.bank.id, amountCents: 1, effectiveAt: new Date() } })
  await assert.rejects(service.activateCashControl(f.actor, { treasuryAccountId: f.box.id, countedCents: 100000, previewToken: preview.previewToken }), /saldos cambiaron/)
  await db.treasuryOpeningBalance.create({ data: { accountId: f.account.id, treasuryAccountId: f.bank.id, amountCents: 1, effectiveAt: new Date(Date.now() + 86400000) } })
  const fresh = await service.previewCashActivation(f.actor)
  await assert.rejects(service.activateCashControl(f.actor, { treasuryAccountId: f.box.id, countedCents: 100000, previewToken: fresh.previewToken }), /fecha futura/)
  assert.equal(await db.cashControl.count({ where: { accountId: f.account.id } }), 0)
})
test("El descarte con motivo confirma secuencia sin crear venta ni dinero", async () => {
  const f = await fixture()
  const result = await operation(f, 1, async tx => { await tx.auditLog.create({ data: { accountId: f.account.id, userId: f.actor.id, action: "SETTINGS_CHANGED", resourceType: "CashPendingDiscard", details: { reason: "Producto inválido" } } }); return { discarded: true } })
  assert.equal(result.discarded, true)
  await operation(f, 2, tx => tx.sale.create({ data: saleData(f) }))
  assert.equal(await expected(f), 110000)
  assert.equal(await db.sale.count({ where: { accountId: f.account.id } }), 1)
})
test("Operaciones mixtas toman primero el bloqueo de negocio y evitan orden inverso", async () => {
  const f = await fixture()
  await db.invoiceSequence.create({ data: { accountId: f.account.id, series: "A", lastNumber: 0 } })
  const seqWhere = { accountId_series: { accountId: f.account.id, series: "A" } }
  await Promise.all([
    transact(f, async tx => {
      await tx.invoiceSequence.update({ where: seqWhere, data: { lastNumber: { increment: 1 } } })
      await new Promise(resolve => setTimeout(resolve, 25))
      await tx.purchase.create({ data: { accountId: f.account.id, userId: f.actor.id, totalCents: 1000, paymentMethod: "TRANSFERENCIA", treasuryAccountId: f.bank.id } })
    }),
    operation(f, 1, async tx => {
      const sale = await tx.sale.create({ data: saleData(f) })
      await tx.invoiceSequence.update({ where: seqWhere, data: { lastNumber: { increment: 1 } } })
      return sale
    }),
  ])
  assert.equal((await db.invoiceSequence.findUnique({ where: seqWhere })).lastNumber, 2)
  assert.equal(await expected(f), 110000)
})
test("Reactivar usa el registro existente y confirma el conteo sin duplicar la base", async () => {
  const f = await fixture()
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f) }))
  await close(f, 1, 110000)
  // Registro antiguo desactivado: solo la preparación de pruebas puede recrearlo.
  await db.cashControl.update({ where: { accountId: f.account.id }, data: { enabled: false } })
  await transact(f, tx => tx.sale.update({ where: { id: sale.id }, data: { cancelledAt: new Date() } }), { correction: { sourceType: "sale", sourceId: sale.id, moneyMoved: false, reason: "Corrección documental" } })
  const preview = await service.previewCashActivation(f.actor)
  assert.equal(preview.accounts.find(a => a.id === f.box.id).balanceCents, 110000)
  await service.activateCashControl(f.actor, { treasuryAccountId: f.box.id, countedCents: 109000, note: "Revisión física al reactivar", previewToken: preview.previewToken })
  await assert.rejects(service.disableCashControl(f.actor), error => error.code === "CASH_CONTROL_IRREVERSIBLE" && error.status === 409)
  f.shift = await service.openCashShift(f.actor, device, 109000)
  assert.equal(await expected(f), 109000)
  assert.equal(await db.cashMovement.count({ where: { accountId: f.account.id, sourceType: "BASELINE" } }), 2)
})
test("Comprobantes e historial respetan usuario, negocio y paginación estable", async () => {
  const f = await fixture(false)
  const ids = Array.from({ length: 101 }, (_, i) => `${f.account.id}_history_${String(i).padStart(3, "0")}`)
  await db.cashShift.createMany({ data: ids.map(id => ({ id, accountId: f.account.id, treasuryAccountId: f.box.id, cashierUserId: f.actor.id, cashierName: "Ana", deviceHash: device, status: "CLOSED", closedAt: new Date(), openingExpectedCents: 100000, openingCountedCents: 100000, openingDifferenceCents: 0, countedClosingCents: 100000, expectedClosingCents: 100000, closingDifferenceCents: 0, closingSnapshot: { movements: [], documents: [], emergency: false } })) })
  const first = await service.listCashHistory(f.actor), second = await service.listCashHistory(f.actor, first.at(-1).id)
  assert.equal(first.length, 100); assert.equal(second.length, 1)
  assert.equal(new Set([...first, ...second].map(r => r.id)).size, 101)
  assert.ok(await service.getCashReceipt(f.actor, first[0].id))
  const other = await fixture(false)
  assert.equal(await service.getCashReceipt(other.actor, first[0].id), null)
  const restricted = { ...f.actor, id: other.actor.id, isOwner: false, canViewAllCashShifts: false, canManageCashShifts: false, canOperateCashShifts: true }
  assert.equal(await service.getCashReceipt(restricted, first[0].id), null)
  await assert.rejects(service.listCashHistory(restricted, first[0].id), /permiso/)
  await assert.rejects(service.listCashHistory({ ...restricted, canManageCashShifts: true }), /permiso/)
})
test("Una venta retroactiva nueva aparece una vez en el registro de tesorería", async () => {
  const f = await fixture()
  const sale = await operation(f, 1, tx => tx.sale.create({ data: saleData(f, { soldAt: new Date(0), createdAt: new Date(0) }) }))
  const treasury = load("@/lib/cash-treasury")
  const legacy = { from: new Date(0), to: new Date(), accounts: [], movements: [{ id: sale.id, source: "SALE_CASH", occurredAt: new Date(0), amountCents: 10000, direction: "IN" }], totals: {} }
  const result = await treasury.cashLedgerDashboard(f.account.id, new Date(0), new Date(), legacy, true)
  assert.equal(result.movements.filter(m => m.source === "SALE_CASH").length, 1)
  assert.equal(result.totals.inCents, 10000)
  assert.equal(result.accounts.find(a => a.id === f.box.id).balanceCents, 110000)
  const earlier = await treasury.cashLedgerDashboard(f.account.id, new Date(0), new Date(1), legacy, true)
  assert.equal(earlier, legacy)
})
test("Una respuesta pendiente conserva idempotencia con datos antiguos de turnos desactivados", async () => {
  const f = await fixture(), id = randomUUID()
  let calls = 0
  const create = tx => { calls++; return tx.sale.create({ data: saleData(f) }) }
  const original = await operation(f, 1, create, id)
  await close(f, 1, 110000)
  // Compatibilidad con negocios que desactivaron turnos antes de introducir el bloqueo permanente.
  await db.cashControl.update({ where: { accountId: f.account.id }, data: { enabled: false } })
  const repeated = await operation(f, 1, create, id)
  assert.equal(repeated.id, original.id); assert.equal(calls, 1)
  assert.equal(await service.drawerBalance(db, f.account.id, f.box.id), 110000)
  await assert.rejects(operation(f, 2, create), /desactivado/)
})
test("Una operación bancaria fuera de turno se reintenta una vez y no puede usar efectivo", async () => {
  const f = await fixture(false); await enable(f)
  const id = randomUUID()
  let calls = 0
  const create = tx => { calls++; return tx.operatingExpense.create({ data: { accountId: f.account.id, userId: f.actor.id, description: "Banco", amountCents: 1000, paymentMethod: "TRANSFERENCIA", treasuryAccountId: f.bank.id } }) }
  const first = await globalOperation(f, create, id), second = await globalOperation(f, create, id)
  assert.equal(first.id, second.id); assert.equal(calls, 1)
  assert.equal(await service.drawerBalance(db, f.account.id, f.bank.id), 299000)
  assert.equal((await service.getCashContext(f.actor, device)).activeShift, null)
  await assert.rejects(globalOperation(f, tx => tx.operatingExpense.create({ data: { accountId: f.account.id, userId: f.actor.id, description: "No", amountCents: 1000, paymentMethod: "EFECTIVO", treasuryAccountId: f.box.id } })), /Abre un turno/)
})
test("El bloqueo financiero permite auditoría con claves foráneas desde otra conexión", async () => {
  const f = await fixture()
  await transact(f, async () => {
    const entry = await db.auditLog.create({ data: { accountId: f.account.id, userId: f.actor.id, action: "SETTINGS_CHANGED", resourceType: "CashTestIndependentAudit" } })
    assert.ok(entry.id)
  })
  assert.equal(await db.auditLog.count({ where: { accountId: f.account.id, resourceType: "CashTestIndependentAudit" } }), 1)
})
test("Acciones reales y proxy Prisma conservan inventario y dinero al reintentar creaciones", async () => {
  const f = await fixture()
  const product = await db.product.create({ data: { accountId: f.account.id, productId: 1, name: "Producto", priceCents: 1000, costCents: 500, itbisRateBp: 0, stock: 10 } })
  const sales = load("@/app/(app)/sales/actions"), purchases = load("@/app/(app)/purchases/actions"), expenses = load("@/app/(app)/operating-expenses/actions"), returns = load("@/app/(app)/returns/actions"), treasury = load("@/app/(app)/treasury/actions"), ocr = load("@/app/(app)/purchases/ocr-actions")
  const meta = n => ({ accountId: f.account.id, userId: f.actor.id, cashShiftId: f.shift.id, clientOperationId: randomUUID(), clientSequence: n })
  const call = fn => cashRequest.run({ trustedActor: f.actor, deviceHash: device }, fn)
  const saleInput = { customerId: null, type: "CONTADO", paymentMethod: "EFECTIVO", treasuryAccountId: f.box.id, items: [{ productId: product.id, qty: 1, unitPriceCents: 1000, wasPriceOverridden: false }], username: f.actor.username, user: f.actor, cashOperation: meta(1) }
  const sale = await call(() => sales.createSale(saleInput))
  assert.equal((await call(() => sales.createSale(saleInput))).id, sale.id)
  const purchaseInput = { paymentMethod: "EFECTIVO", treasuryAccountId: f.box.id, items: [{ productId: product.id, qty: 2, unitCostCents: 500 }], updateProductPrice: false, cashOperation: meta(2) }
  const purchase = await call(() => purchases.createPurchase(purchaseInput))
  assert.equal((await call(() => purchases.createPurchase(purchaseInput))).id, purchase.id)
  const expenseInput = { description: "Gasto", amountCents: 250, paymentMethod: "EFECTIVO", treasuryAccountId: f.box.id, expenseDate: new Date(), cashOperation: meta(3) }
  const expense = await call(() => expenses.createOperatingExpense(expenseInput))
  assert.equal((await call(() => expenses.createOperatingExpense(expenseInput))).id, expense.id)
  const item = await db.saleItem.findFirst({ where: { saleId: sale.id } })
  const returnInput = { saleId: sale.id, refundMethod: "EFECTIVO", refundTreasuryAccountId: f.box.id, items: [{ saleItemId: item.id, productId: product.id, qty: 1, unitPriceCents: 1000 }], cashOperation: meta(4) }
  const returned = await call(() => returns.createReturn(returnInput))
  assert.equal((await call(() => returns.createReturn(returnInput))).id, returned.id)
  const transferInput = { fromTreasuryAccountId: f.box.id, toTreasuryAccountId: f.bank.id, amountCents: 1000, transferredAt: new Date(), note: "Banco", cashOperation: meta(5) }
  const transfer = await call(() => treasury.createTreasuryTransfer(transferInput))
  assert.equal((await call(() => treasury.createTreasuryTransfer(transferInput))).id, transfer.id)
  await db.productSequence.upsert({ where: { accountId: f.account.id }, create: { accountId: f.account.id, lastNumber: 1 }, update: { lastNumber: 1 } })
  const ocrInput = { supplierName: null, paymentMethod: "EFECTIVO", treasuryAccountId: f.box.id, products: [{ productId: null, sku: "OCR-NEW", reference: null, description: "Nuevo OCR", quantity: 1, unitCostCents: 200, createNew: true, sellPriceCents: 400 }], updateProductPrice: false, cashOperation: meta(6) }
  const scanned = await call(() => ocr.createPurchaseFromOCR(ocrInput))
  assert.equal((await call(() => ocr.createPurchaseFromOCR(ocrInput))).id, scanned.id)
  assert.equal(Number((await db.product.findUnique({ where: { id: product.id } })).stock), 12)
  assert.equal(Number((await db.product.findFirst({ where: { accountId: f.account.id, sku: "OCR-NEW" } })).stock), 1)
  assert.equal(await expected(f), 97550)
  assert.equal(await db.cashOperation.count({ where: { cashShiftId: f.shift.id } }), 6)
  assert.equal(await db.purchase.count({ where: { accountId: f.account.id } }), 2)
  assert.equal(await db.return.count({ where: { accountId: f.account.id } }), 1)
  await close(f, 6, 97550)
  const snapshot = (await db.cashShift.findUnique({ where: { id: f.shift.id } })).closingSnapshot
  const oldShiftId = f.shift.id
  f.shift = await service.openCashShift(f.actor, device, 97550)
  await service.correctClosedCashDocument(f.actor, device, { sourceType: "purchase", sourceId: purchase.id, moneyMoved: false, reason: "Corrección documental sin devolución de dinero" })
  const correction = await db.auditLog.findFirst({ where: { accountId: f.account.id, resourceType: "CashDocumentCorrection", resourceId: purchase.id } })
  assert.equal(correction.details.moneyMoved, false)
  assert.equal(correction.details.reason, "Corrección documental sin devolución de dinero")
  assert.equal(await expected(f), 97550)
  assert.deepEqual((await db.cashShift.findUnique({ where: { id: oldShiftId } })).closingSnapshot, snapshot)
  await service.prepareCashClose(f.actor, device, f.shift.id, 0)
  await assert.rejects(service.correctClosedCashDocument(f.actor, device, { sourceType: "purchase", sourceId: scanned.id, moneyMoved: true, reason: "Reembolso real" }), /cerrando/)
  assert.equal((await db.purchase.findUnique({ where: { id: scanned.id } })).cancelledAt, null)
  assert.equal(Number((await db.product.findFirst({ where: { accountId: f.account.id, sku: "OCR-NEW" } })).stock), 1)
})
