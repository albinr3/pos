// PostgreSQL real, credenciales y proveedores ficticios. Nunca conectar la suite a DATABASE_URL.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { randomUUID, generateKeyPairSync, createHmac } from "node:crypto"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { PrismaClient } from "@prisma/client"

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error("Define TEST_DATABASE_URL; DATABASE_URL nunca se usa")
const parsed = new URL(url)
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !/^\/pos_account_deletion_test(?:_\d+)?$/.test(parsed.pathname)) throw new Error("Solo bases locales pos_account_deletion_test")
const db = new PrismaClient({ datasources: { db: { url } } })
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), require = createRequire(import.meta.url)
const jwt = require("jsonwebtoken"), bcrypt = require("bcryptjs"), modules = new Map()
const { verifyToken } = require("@clerk/backend")
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const subSecret = randomUUID(), webhookSecret = `whsec_${Buffer.from(randomUUID()).toString("base64")}`
process.env.JWT_SECRET = subSecret
process.env.CLERK_JWT_KEY = publicKey.export({ type: "spki", format: "pem" })
process.env.CLERK_SECRET_KEY = "sk_test_fixture"
process.env.CLERK_WEBHOOK_SECRET = webhookSecret
process.env.LEMON_API_KEY = "fixture-only"
process.env.LEMON_WEBHOOK_SECRET = "fixture-lemon"
process.env.CRON_SECRET = "fixture-cron"
let webClerk = null, cookieToken = null, webhookHeaders = new Headers(), failProvider = null, calls = [], superAdmin = null
const fixtureAccounts = []

async function fakeFetch(input, init = {}) {
  assert.equal(init.method, "DELETE", "Solo se esperan bajas ficticias de proveedores")
  const target = String(input)
  if (target.startsWith("https://api.lemonsqueezy.com/")) {
    calls.push(["lemon", target.split("/").at(-1)])
    if (failProvider === "lemon") return Response.json({}, { status: 503 })
    return Response.json({ data: { attributes: { cancelled: true } } })
  }
  if (target.startsWith("https://api.clerk.com/")) {
    calls.push(["clerk", target.split("/").at(-1)])
    if (failProvider === "clerk") return Response.json({}, { status: 503 })
    return Response.json({ deleted: true })
  }
  throw new Error("Prohibida una petición de red no simulada")
}
function load(name, from = path.join(root, "src/_test.ts")) {
  if (name === "next/cache") return { revalidatePath() {} }
  if (name === "next/headers") return { headers: async () => webhookHeaders, cookies: async () => ({ get: () => cookieToken ? { value: cookieToken } : undefined, delete() {} }) }
  if (name === "@clerk/nextjs/server") return { verifyToken, auth: async () => ({ userId: webClerk }), currentUser: async () => ({ id: webClerk, firstName: "Prueba", emailAddresses: [] }) }
  if (name === "uploadthing/server") return { UTApi: class { async deleteFiles(keys) { calls.push(["files", ...keys]); if (failProvider === "files") throw new Error("Provider with sensitive content"); return { success: true, deletedCount: keys.length } } } }
  if (name === "@/lib/error-logger") return { logError: async () => {}, ErrorCodes: {} }
  if (name === "@/lib/super-admin-auth") return { getCurrentSuperAdmin: async () => superAdmin, logSuperAdminAction: async () => {} }
  if (name === "@/lib/resend") return { sendResendEmail: async () => { throw new Error("No enviar correo tras la baja") } }
  if (name === "@/lib/resend/templates") return {}
  if (!name.startsWith("@/") && !name.startsWith(".")) return require(name)
  const file = name.startsWith("@/") ? path.join(root, "src", name.slice(2) + ".ts") : path.resolve(path.dirname(from), name + ".ts")
  if (modules.has(file)) return modules.get(file)
  const exports = {}; modules.set(file, exports)
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  vm.runInNewContext(compiled, {
    exports, require: n => load(n, file), console: { ...console, log() {}, error() {} }, Date, Map, Set, Buffer,
    URL, Headers, Request, Response, AbortSignal, fetch: fakeFetch, process, globalThis: { prisma: db },
    setInterval: (...args) => { const timer = setInterval(...args); timer.unref(); return timer },
    setTimeout, clearTimeout,
  }, { filename: file })
  return exports
}
const service = load("@/lib/account-deletion"), guard = load("@/lib/account-deletion-guard"), authLib = load("@/lib/auth")
const route = load("@/app/api/account/route"), cron = load("@/app/api/cron/account-deletions/route")
const cash = load("@/lib/cash-context"), { NextRequest } = require("next/server")
const providers = { cancelSubscription: async id => { calls.push(["cancel", id]) }, deleteIdentity: async id => { calls.push(["identity", id]) }, deleteFiles: async keys => { calls.push(["cleanup", ...keys]) } }

async function fixture(extra = {}) {
  const account = await db.account.create({ data: { name: "Negocio ficticio", clerkUserId: `fixture_${randomUUID()}`, ...extra } })
  fixtureAccounts.push(account.id)
  const owner = await db.user.create({ data: { accountId: account.id, name: "Dueña", username: "owner", isOwner: true, passwordHash: await bcrypt.hash("4321", 4) } })
  const employee = await db.user.create({ data: { accountId: account.id, name: "Empleado", username: "employee", passwordHash: await bcrypt.hash("9999", 4) } })
  return { account, owner, employee }
}
function identity(f, user = f.owner) { return { clerkUserId: f.account.clerkUserId, accountId: f.account.id, userId: user.id, pin: "4321" } }
async function request(f, options = {}) {
  const user = options.user || f.owner
  const headers = { "content-type": "application/json", "x-forwarded-for": options.ip || randomUUID() }
  const body = options.body ?? { pin: "4321", confirmation: "ELIMINAR" }
  if (options.mobile !== false) {
    headers["x-clerk-authorization"] = options.bearer || `Bearer ${jwt.sign({ sid: "sess_fixture", sub: f.account.clerkUserId, iss: "https://fixture.clerk.accounts.dev" }, privateKey, { algorithm: "RS256", expiresIn: options.expired ? -5 : 60 })}`
    headers["x-subuser-token"] = options.subToken || jwt.sign({ accountId: options.accountId || f.account.id, userId: user.id }, subSecret, { expiresIn: 60 })
  }
  if (options.origin) headers.origin = options.origin
  return route.DELETE(new NextRequest("https://fixture.test/api/account", { method: "DELETE", headers, body: JSON.stringify(body) }))
}

test("migración preserva la cuenta y aplica valores de seguridad por defecto", async () => {
  const f = await db.account.findUniqueOrThrow({ where: { id: "deletion-migration-fixture" } })
  assert.equal(f.name, "Migración de prueba"); assert.equal(f.deletionRequestedAt, null); assert.equal(f.deletionPinAttempts, 0)
  const rls = await db.$queryRaw`SELECT relrowsecurity FROM pg_class WHERE relname = 'AccountDeletion'`
  assert.equal(rls[0].relrowsecurity, true)
})

test("API exige Clerk verificado, sesión firmada y dueño del mismo negocio", async () => {
  const f = await fixture(), other = await fixture()
  for (const options of [
    { mobile: false }, { bearer: "Bearer manipulated.payload.signature" }, { expired: true },
    { subToken: "invalid" }, { accountId: other.account.id },
  ]) assert.equal((await request(f, options)).status, 401)
  assert.equal((await request(f, { user: f.employee })).status, 403)
  assert.equal((await request(f, { origin: "https://attacker.test" })).status, 403)
  assert.equal(await db.accountDeletion.count({ where: { accountId: f.account.id } }), 0)
})

test("API valida confirmación y rechaza IDs enviados por el cliente", async () => {
  const f = await fixture()
  for (const body of [{ pin: "4321", confirmation: "eliminar" }, { pin: "4321", confirmation: "ELIMINAR", accountId: "other" }, {}, []]) {
    assert.equal((await request(f, { body })).status, 400)
  }
  assert.equal((await db.account.findUniqueOrThrow({ where: { id: f.account.id } })).deletionRequestedAt, null)
})

test("PIN incorrecto tiene límite persistente y no inicia el borrado", async () => {
  const f = await fixture()
  for (let i = 0; i < 5; i++) assert.equal((await request(f, { body: { pin: "0000", confirmation: "ELIMINAR" } })).status, 400)
  const blocked = await request(f)
  assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get("retry-after")) > 0)
  assert.equal((await db.account.findUniqueOrThrow({ where: { id: f.account.id } })).deletionPinAttempts, 5)
  assert.equal(await db.accountDeletion.count({ where: { accountId: f.account.id } }), 0)
})

test("confirmación bloquea sesiones, es idempotente y evita recreación por getOrCreateAccount", async () => {
  const f = await fixture()
  const result = await service.requestAccountDeletion(identity(f))
  assert.equal(result.success, true)
  const duplicate = await service.requestAccountDeletion(identity(f))
  assert.equal(duplicate.job.id, result.job.id)
  assert.equal(await db.user.count({ where: { accountId: f.account.id, isActive: true } }), 0)
  webClerk = f.account.clerkUserId
  cookieToken = jwt.sign({ accountId: f.account.id, userId: f.owner.id }, subSecret)
  assert.equal(await authLib.getCurrentUser(), null)
  assert.equal(await authLib.getOrCreateAccount(), null)
  webClerk = null; cookieToken = null
  assert.ok(await guard.isAccountIdentityDeleted(f.account.clerkUserId))
})

test("dos confirmaciones simultáneas generan una sola tarea", async () => {
  const f = await fixture()
  const [a, b] = await Promise.all([service.requestAccountDeletion(identity(f)), service.requestAccountDeletion(identity(f))])
  assert.equal(a.job.id, b.job.id)
  assert.equal(await db.accountDeletion.count({ where: { accountId: f.account.id } }), 1)
})

async function fullBusiness(f, sharedKey) {
  const accountId = f.account.id, userId = f.owner.id
  await db.companySettings.create({ data: { accountId, name: "Fixture", phone: "", address: "", logoUrl: "https://demo.ufs.sh/f/logo-exclusive" } })
  const ingredient = await db.product.create({ data: { accountId, productId: 1, name: "Ingrediente", costCents: 50, priceCents: 100, stock: 30, imageUrls: [`https://utfs.io/f/${sharedKey}`] } })
  const product = await db.product.create({ data: { accountId, productId: 2, name: "Receta", productKind: "RECIPE", costCents: 100, priceCents: 1000, imageUrls: ["https://demo.ufs.sh/f/product-exclusive"] } })
  await db.productRecipeItem.create({ data: { productId: product.id, ingredientId: ingredient.id, qty: 1 } })
  const customer = await db.customer.create({ data: { accountId, name: "Cliente", visualId: 1 } })
  const box = await db.treasuryAccount.create({ data: { accountId, name: "Caja", type: "CAJA" } })
  const bank = await db.treasuryAccount.create({ data: { accountId, name: "Banco", type: "BANCO" } })
  const shift = await db.cashShift.create({ data: { accountId, treasuryAccountId: box.id, cashierUserId: userId, cashierName: "Dueña", deviceHash: "fixture", openingExpectedCents: 0, openingCountedCents: 0, openingDifferenceCents: 0 } })
  await db.cashControl.create({ data: { accountId, treasuryAccountId: box.id, enabled: true, ledgerStartedAt: new Date() } })
  await db.cashMovement.create({ data: { accountId, treasuryAccountId: box.id, cashShiftId: shift.id, userId, sourceType: "fixture", sourceId: "fixture", reference: "Fixture", amountCents: 1000 } })
  const transfer = await db.treasuryTransfer.create({ data: { accountId, fromTreasuryAccountId: box.id, toTreasuryAccountId: bank.id, transferredAt: new Date(), amountCents: 100, createdByUserId: userId, status: "REVERSED" } })
  await db.treasuryTransfer.create({ data: { accountId, fromTreasuryAccountId: bank.id, toTreasuryAccountId: box.id, transferredAt: new Date(), amountCents: 100, createdByUserId: userId, reversesTransferId: transfer.id } })
  const sale = await db.sale.create({ data: { accountId, userId, customerId: customer.id, invoiceNumber: 1, invoiceCode: "A-00001", type: "CREDITO", subtotalCents: 1000, itbisCents: 0, totalCents: 1000, items: { create: { productId: product.id, qty: 1, unitPriceCents: 1000, lineTotalCents: 1000 } } } })
  const item = await db.saleItem.findFirstOrThrow({ where: { saleId: sale.id } })
  await db.saleItemConsumption.create({ data: { saleItemId: item.id, ingredientId: ingredient.id, qty: 1 } })
  const ar = await db.accountReceivable.create({ data: { saleId: sale.id, customerId: customer.id, totalCents: 1000, balanceCents: 900 } })
  await db.payment.create({ data: { arId: ar.id, userId, receiptNumber: 1, receiptCode: "R-1", amountCents: 100 } })
  await db.return.create({ data: { accountId, userId, saleId: sale.id, returnNumber: 1, returnCode: "DEV-1", subtotalCents: 100, itbisCents: 0, totalCents: 100, items: { create: { saleItemId: item.id, productId: product.id, qty: 1, unitPriceCents: 100, lineTotalCents: 100 } } } })
  const supplier = await db.supplier.create({ data: { accountId, name: "Proveedor" } })
  const purchase = await db.purchase.create({ data: { accountId, userId, type: "CREDITO", supplierId: supplier.id, totalCents: 1000 } })
  const ap = await db.accountPayable.create({ data: { accountId, purchaseId: purchase.id, supplierId: supplier.id, totalCents: 1000, balanceCents: 500, dueDate: new Date("2026-12-01") } })
  await db.supplierPayment.create({ data: { accountId, apId: ap.id, supplierId: supplier.id, supplierName: "Proveedor", userId, amountCents: 500, method: "TRANSFERENCIA", treasuryAccountId: bank.id, reference: "PP-fixture" } })
  await db.operatingExpense.create({ data: { accountId, userId, description: "Gasto", amountCents: 100 } })
  await db.quote.create({ data: { accountId, userId, customerId: customer.id, quoteNumber: 1, quoteCode: "COT-1", subtotalCents: 1000, itbisCents: 0, totalCents: 1000, items: { create: { productId: product.id, qty: 1, unitPriceCents: 1000, lineTotalCents: 1000, recipeAdjustments: { create: { ingredientId: ingredient.id, ingredientName: "Ingrediente", type: "EXTRA" } } } } } })
  const subscription = await db.billingSubscription.create({ data: { accountId, status: "BLOCKED", lemonSubscriptionId: "lemon-fixture" } })
  const billing = await db.billingPayment.create({ data: { subscriptionId: subscription.id, amountCents: 1000, currency: "USD", provider: "LEMON" } })
  await db.billingPaymentProof.create({ data: { paymentId: billing.id, url: "https://demo.ufs.sh/f/proof-exclusive" } })
  await db.whatsappOtp.create({ data: { userId, phoneNumber: "18090000000", code: "123456", purpose: "login", expiresAt: new Date(Date.now() + 60000) } })
  const error = await db.errorLog.create({ data: { accountId, userId, userEmail: "fixture@example.invalid", message: "Fixture" } })
  await db.superAdminNotification.create({ data: { type: "ERROR_HIGH", title: "Error", message: "Fixture", href: "/super-admin/errors", sourceId: error.id } })
}

test("negocio completo se borra sin FK pendientes, conserva otro negocio y archivos compartidos", async () => {
  const f = await fixture(), other = await fixture(), sharedKey = `shared-${randomUUID()}`
  await db.companySettings.create({ data: { accountId: other.account.id, name: "Conservar", phone: "", address: "", logoUrl: `https://other.ufs.sh/f/${sharedKey}` } })
  await fullBusiness(f, sharedKey)
  calls = []
  const result = await service.requestAccountDeletion(identity(f))
  assert.equal(result.success, true)
  assert.ok(!result.job.fileKeys.includes(sharedKey))
  assert.equal(await service.processAccountDeletion(result.job.id, providers), true)
  assert.equal(await db.account.count({ where: { id: f.account.id } }), 0)
  for (const model of ["user", "supplierPayment", "accountPayable", "cashMovement", "cashShift", "treasuryTransfer", "product", "errorLog"]) assert.equal(await db[model].count({ where: { accountId: f.account.id } }), 0, model)
  assert.equal(await db.account.count({ where: { id: other.account.id } }), 1)
  assert.equal(await db.user.count({ where: { accountId: other.account.id, isActive: true } }), 2)
  assert.deepEqual(calls.map(call => call[0]), ["cancel", "identity", "cleanup"])
  const job = await db.accountDeletion.findUniqueOrThrow({ where: { id: result.job.id } })
  assert.equal(job.stage, "COMPLETED"); assert.equal(job.clerkUserId, null); assert.equal(job.lemonSubscriptionId, null); assert.equal(job.fileKeys.length, 0)
  assert.equal(job.clerkUserHash, guard.accountIdentityHash(f.account.clerkUserId))
})

test("fallos externos conservan referencias, reanudan etapas y no duplican el borrado", async () => {
  const f = await fixture()
  await db.billingSubscription.create({ data: { accountId: f.account.id, lemonSubscriptionId: "retry-fixture" } })
  const { job } = await service.requestAccountDeletion(identity(f))
  calls = []; failProvider = "lemon"
  assert.equal(await service.processAccountDeletion(job.id), false)
  let state = await db.accountDeletion.findUniqueOrThrow({ where: { id: job.id } })
  assert.equal(state.stage, "CANCEL_SUBSCRIPTION"); assert.equal(state.lemonSubscriptionId, "retry-fixture"); assert.equal(state.lastError, "LEMON_CANCEL_FAILED")
  assert.equal(await db.account.count({ where: { id: f.account.id } }), 1)
  await db.accountDeletion.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } })
  failProvider = "clerk"
  assert.equal(await service.processAccountDeletion(job.id), false)
  state = await db.accountDeletion.findUniqueOrThrow({ where: { id: job.id } })
  assert.equal(state.stage, "DELETE_IDENTITY"); assert.equal(state.clerkUserId, f.account.clerkUserId)
  assert.equal(await db.account.count({ where: { id: f.account.id } }), 0)
  await db.accountDeletion.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } })
  failProvider = null
  assert.equal(await service.processAccountDeletion(job.id), true)
  const count = calls.length
  assert.equal(await service.processAccountDeletion(job.id), true)
  assert.equal(calls.length, count)
})

test("concesión excluye trabajadores concurrentes y recupera ejecuciones interrumpidas", async () => {
  const f = await fixture(), { job } = await service.requestAccountDeletion(identity(f))
  let release, entered
  const ready = new Promise(resolve => { entered = resolve })
  const worker = service.processAccountDeletion(job.id, { ...providers, deleteIdentity: async () => { entered(); await new Promise(resolve => { release = resolve }) } })
  await ready
  assert.equal(await service.processAccountDeletion(job.id, providers), false)
  release(); assert.equal(await worker, true)
  const next = await fixture(), pending = await service.requestAccountDeletion(identity(next))
  await db.accountDeletion.update({ where: { id: pending.job.id }, data: { leaseToken: "dead-worker", leaseExpiresAt: new Date(0) } })
  assert.equal(await service.processAccountDeletion(pending.job.id, providers), true)
})

test("archivos fallidos conservan referencias y se revalida si pasan a ser compartidos", async () => {
  const f = await fixture(), other = await fixture(), key = `retry-file-${randomUUID()}`
  await db.companySettings.create({ data: { accountId: f.account.id, name: "Fixture", phone: "", address: "", logoUrl: `https://demo.ufs.sh/f/${key}` } })
  const { job } = await service.requestAccountDeletion(identity(f))
  const failed = { ...providers, deleteFiles: async () => { throw new Error("Sensitive provider message") } }
  assert.equal(await service.processAccountDeletion(job.id, failed), false)
  const state = await db.accountDeletion.findUniqueOrThrow({ where: { id: job.id } })
  assert.equal(state.stage, "DELETE_FILES"); assert.equal(state.fileKeys[0], key); assert.equal(state.lastError, "DELETE_FILES_FAILED")
  await db.companySettings.create({ data: { accountId: other.account.id, name: "Conservar", phone: "", address: "", logoUrl: `https://utfs.io/f/${key}` } })
  await db.accountDeletion.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } })
  calls = []
  assert.equal(await service.processAccountDeletion(job.id, providers), true)
  assert.equal(calls.length, 0, "No se repite Clerk ni se elimina el archivo compartido")
})

test("operaciones financieras rechazan una cuenta en baja después de tomar el bloqueo", async () => {
  const f = await fixture()
  await service.requestAccountDeletion(identity(f))
  const purchase = load("@/lib/purchase-credit"), financial = load("@/lib/cash-financial-db")
  await assert.rejects(() => db.$transaction(tx => purchase.lockPurchaseAccount(tx, f.account.id)), error => error.code === "ACCOUNT_DELETING")
  await assert.rejects(() => cash.cashRequest.run({ trustedActor: f.owner }, () => financial.runCashTransaction(db, async () => {})), error => error.code === "ACCOUNT_DELETING")
})

test("un fallo local revierte la purga completa y permite reanudarla sin perder referencias", async () => {
  const f = await fixture(), other = await fixture()
  await db.companySettings.create({ data: { accountId: f.account.id, name: "Conservar hasta commit", phone: "", address: "" } })
  // Una referencia histórica incoherente entre negocios debe provocar rollback, nunca borrar el otro.
  const crossReference = await db.sale.create({ data: { accountId: other.account.id, userId: f.owner.id, invoiceNumber: 1, invoiceCode: "A-cross-fixture", type: "CONTADO", subtotalCents: 100, itbisCents: 0, totalCents: 100 } })
  const { job } = await service.requestAccountDeletion(identity(f))
  assert.equal(await service.processAccountDeletion(job.id, providers), false)
  assert.equal((await db.accountDeletion.findUniqueOrThrow({ where: { id: job.id } })).stage, "PURGE_DATA")
  assert.equal(await db.companySettings.count({ where: { accountId: f.account.id } }), 1)
  assert.equal(await db.user.count({ where: { accountId: f.account.id } }), 2)
  assert.equal(await db.sale.count({ where: { id: crossReference.id } }), 1)
  await db.sale.update({ where: { id: crossReference.id }, data: { userId: other.owner.id } })
  await db.accountDeletion.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } })
  assert.equal(await service.processAccountDeletion(job.id, providers), true)
  assert.equal(await db.sale.count({ where: { id: crossReference.id } }), 1)
})

test("borrado administrativo reutiliza el orden corregido y mantiene su autorización", async () => {
  const actions = load("@/app/super-admin/(dashboard)/accounts/actions"), f = await fixture()
  await fullBusiness(f, `admin-shared-${randomUUID()}`)
  superAdmin = null
  assert.equal((await actions.deleteAccount(f.account.id)).success, false)
  superAdmin = { id: "fixture-super-admin", canDeleteAccounts: true }; calls = []
  assert.equal((await actions.deleteAccount(f.account.id)).success, true)
  assert.equal(await db.account.count({ where: { id: f.account.id } }), 0)
  assert.equal(calls.length, 0, "La autorización administrativa conserva su comportamiento de proveedores")
  superAdmin = null
})

test("API web y móvil aceptan cuentas bloqueadas, limpian cookie y distinguen 200/202", async () => {
  const f = await fixture()
  await db.billingSubscription.create({ data: { accountId: f.account.id, status: "BLOCKED" } })
  calls = []; failProvider = null
  const response = await request(f)
  assert.equal(response.status, 200); assert.equal((await response.json()).status, "completed")
  assert.ok(response.headers.get("set-cookie").includes("movopos-session="))
  const web = await fixture()
  webClerk = web.account.clerkUserId
  cookieToken = jwt.sign({ accountId: web.account.id, userId: web.owner.id }, subSecret)
  failProvider = "clerk"
  const pending = await request(web, { mobile: false })
  assert.equal(pending.status, 202); assert.equal((await pending.json()).status, "processing")
  webClerk = null; cookieToken = null; failProvider = null
})

test("webhooks firmados atrasados no recrean la cuenta y cancelan checkout tardío", async () => {
  const f = await fixture(), { job } = await service.requestAccountDeletion(identity(f))
  await service.processAccountDeletion(job.id, providers)
  const clerk = load("@/app/api/auth/clerk-webhook/route"), { Webhook } = require("svix")
  for (const type of ["user.created", "user.updated"]) {
    const payload = { type, data: { id: f.account.clerkUserId, first_name: "Viejo", email_addresses: [] } }
    const body = JSON.stringify(payload), id = randomUUID(), at = new Date()
    webhookHeaders = new Headers({ "svix-id": id, "svix-timestamp": String(Math.floor(at.getTime() / 1000)), "svix-signature": new Webhook(webhookSecret).sign(id, at, body) })
    assert.equal((await clerk.POST(new NextRequest("https://fixture.test/api/auth/clerk-webhook", { method: "POST", body }))).status, 200)
  }
  assert.equal(await db.account.count({ where: { clerkUserId: f.account.clerkUserId } }), 0)
  const lemon = load("@/app/api/webhooks/lemon/route")
  const body = JSON.stringify({ meta: { event_name: "subscription_created", custom_data: { account_id: f.account.id } }, data: { id: "late-checkout", type: "subscriptions", attributes: { cancelled: false, status: "active" } } })
  const signature = createHmac("sha256", process.env.LEMON_WEBHOOK_SECRET).update(body).digest("hex")
  calls = []
  const response = await lemon.POST(new NextRequest("https://fixture.test/api/webhooks/lemon", { method: "POST", body, headers: { "x-signature": signature } }))
  assert.equal(response.status, 200); assert.deepEqual(calls, [["lemon", "late-checkout"]])
})

test("cron falla cerrado sin secreto o con credencial inválida", async () => {
  assert.equal((await cron.GET(new NextRequest("https://fixture.test/api/cron/account-deletions"))).status, 401)
  const saved = process.env.CRON_SECRET; delete process.env.CRON_SECRET
  assert.equal((await cron.GET(new NextRequest("https://fixture.test/api/cron/account-deletions", { headers: { authorization: "Bearer undefined" } }))).status, 401)
  process.env.CRON_SECRET = saved
})

after(async () => {
  // Fixtures desechables únicamente; conservar huellas completadas permite inspeccionar la prueba.
  for (const accountId of fixtureAccounts) {
    await cash.cashRequest.run({ maintenance: true }, () => load("@/lib/db").prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${accountId} FOR UPDATE`
      await load("@/lib/account-purge").purgeAccountData(tx, accountId)
    }, { timeout: 30000 }))
  }
  await db.$disconnect()
})
