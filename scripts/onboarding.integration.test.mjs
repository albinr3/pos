// PostgreSQL real y conexiones independientes. Autenticación, auditoría y caché simuladas.
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
const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error("Define TEST_DATABASE_URL; nunca se usa DATABASE_URL")
const parsed = new URL(url)
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !/^\/pos_onboarding_test(?:_\d+)?$/.test(parsed.pathname) || parsed.search) throw new Error("Solo bases locales pos_onboarding_test")
const clients = Array.from({ length: 3 }, () => new PrismaClient({ datasources: { db: { url } }, transactionOptions: { maxWait: 15000, timeout: 15000 } }))
after(async () => { await Promise.all(clients.map(db => db.$disconnect())) })
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), require = createRequire(import.meta.url)
function app(db, actor) {
  const cache = new Map()
  function load(relative) {
    const file = path.join(root, relative)
    if (cache.has(file)) return cache.get(file)
    const exports = {}; cache.set(file, exports)
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(code, { exports, console, Date, Math, Number, Error, require: name => {
      if (name === "@/lib/db") return { prisma: db }
      if (name === "@/lib/account-onboarding") return load("src/lib/account-onboarding.ts")
      if (name === "@/lib/auth") return { getCurrentUser: async () => actor }
      if (name === "../products/actions") return load("src/app/(app)/products/actions.ts")
      if (name === "@/lib/sanitize") return { sanitizeString: s => s.trim(), sanitizeCode: s => s.trim() }
      if (name === "@/lib/audit-log") return { logAuditEvent: async () => {} }
      if (name === "@/lib/error-logger") return { logError: async () => {}, ErrorCodes: {} }
      if (name === "@/lib/units") return { unitAllowsDecimals: unit => unit !== "UNIDAD", decimalToNumber: Number }
      if (name === "@/lib/inventory") return { INITIAL_STOCK_REASON: "Prueba local" }
      if (name === "@/lib/permission-guard") return { ensurePermission() {} }
      if (name === "next/cache") return { revalidatePath() {} }
      if (!name.startsWith("@/")) return require(name)
      throw new Error("Dependencia inesperada: " + name)
    } }, { filename: file })
    return exports
  }
  return { service: load("src/lib/account-onboarding.ts"), web: load("src/app/(app)/onboarding/actions.ts"), products: load("src/app/(app)/products/actions.ts") }
}
async function fixture({ practiced = false, real = true } = {}) {
  const db = clients[0]
  const account = await db.account.create({ data: { name: "Prueba onboarding", clerkUserId: `test-${randomUUID()}` } })
  const actor = await db.user.create({ data: { accountId: account.id, name: "Dueño", username: "admin", passwordHash: "fixture-no-login", isOwner: true } })
  await db.accountOnboarding.create({ data: { accountId: account.id, demoProductsSeededAt: new Date(), demoCheckoutCompletedAt: practiced ? new Date() : null, mobileAutoStartEligible: true } })
  for (let i = 1; i <= 3; i++) await db.product.create({ data: { accountId: account.id, productId: i, name: `Demo ${i}`, priceCents: 200, costCents: 100, isOnboardingDemo: true } })
  const demo = await db.product.findFirstOrThrow({ where: { accountId: account.id, isOnboardingDemo: true } })
  await db.inventoryAdjustment.create({ data: { accountId: account.id, productId: demo.id, userId: actor.id, qtyDelta: 1, reason: "Historial a conservar" } })
  const product = real ? await db.product.create({ data: { accountId: account.id, productId: 4, name: "Real", priceCents: 200, costCents: 100 } }) : null
  await db.productSequence.create({ data: { accountId: account.id, lastNumber: real ? 4 : 3 } })
  return { account, actor, product, apps: clients.map(client => app(client, actor)) }
}
const productInput = (actor, name) => ({ user: actor, name, priceCents: 300, costCents: 100, stock: 2, minStock: 0, productKind: "BASIC", unit: "UNIDAD", isAvailableForSale: true })
async function verify(f, timestamp) {
  const db = clients[0], row = await db.accountOnboarding.findUniqueOrThrow({ where: { accountId: f.account.id } })
  assert.ok(row.completedAt)
  if (timestamp) assert.equal(row.completedAt.toISOString(), timestamp)
  assert.equal(await db.product.count({ where: { accountId: f.account.id, isOnboardingDemo: true } }), 3)
  assert.equal(await db.product.count({ where: { accountId: f.account.id, isOnboardingDemo: true, isActive: true } }), 0)
  assert.equal(await db.inventoryAdjustment.count({ where: { accountId: f.account.id, reason: "Historial a conservar" } }), 1)
  const again = await f.apps[1].service.completeAccountOnboarding(f.account.id, f.product?.id ?? row.firstRealProductId)
  assert.equal(again.completedAt, row.completedAt.toISOString())
}

test("Web y móvil finalizan simultáneamente sin deadlock y conservan el primer timestamp", { timeout: 60000 }, async () => {
  for (let i = 0; i < 8; i++) {
    const f = await fixture()
    const [mobile, web] = await Promise.all([f.apps[0].service.completeAccountOnboarding(f.account.id, f.product.id), f.apps[1].web.completeDemoCheckout()])
    assert.equal(web.next, "COMPLETED"); await verify(f, mobile.completedAt)
  }
})

test("Finalización móvil, práctica web y alta de producto comparten el bloqueo en conexiones distintas", { timeout: 60000 }, async () => {
  for (let i = 0; i < 8; i++) {
    const f = await fixture()
    const [mobile, web, created] = await Promise.all([
      f.apps[0].service.completeAccountOnboarding(f.account.id, f.product.id),
      f.apps[1].web.completeDemoCheckout(),
      f.apps[2].products.upsertProduct(productInput(f.actor, "Producto concurrente")),
    ])
    assert.equal(web.next, "COMPLETED"); assert.equal(created.ok, true); await verify(f, mobile.completedAt)
    assert.equal(await clients[0].product.count({ where: { accountId: f.account.id, name: "Producto concurrente" } }), 1)
  }
})

test("Dos altas tras la práctica web completan una vez y mantienen los productos e historial", { timeout: 60000 }, async () => {
  const f = await fixture({ practiced: true, real: false })
  const results = await Promise.all([f.apps[0].products.upsertProduct(productInput(f.actor, "Uno")), f.apps[1].products.upsertProduct(productInput(f.actor, "Dos"))])
  assert.ok(results.every(result => result.ok)); await verify(f)
  assert.equal(await clients[0].product.count({ where: { accountId: f.account.id, isOnboardingDemo: false } }), 2)
})

test("La validación real rechaza costo cero antes de crear un producto", async () => {
  const f = await fixture()
  await assert.rejects(() => f.apps[0].products.upsertProduct({ ...productInput(f.actor, "Inválido"), costCents: 0 }), /costo/)
  assert.equal(await clients[0].product.count({ where: { accountId: f.account.id, name: "Inválido" } }), 0)
})


test("El bloqueo por negocio se adquiere antes de escribir productos u onboarding", { timeout: 15000 }, async () => {
  const f = await fixture()
  let entered, release
  const ready = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const holder = f.apps[0].service.withOnboardingTransaction(f.account.id, async () => { entered(); await gate })
  await ready
  const mobile = f.apps[1].service.completeAccountOnboarding(f.account.id, f.product.id)
  const creating = f.apps[2].products.upsertProduct(productInput(f.actor, "Esperando bloqueo"))
  try {
    let waiters = 0
    for (let i = 0; i < 100 && waiters < 2; i++) {
      const rows = await clients[0].$queryRaw`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`
      waiters = rows[0].count
      if (waiters < 2) await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.equal(waiters, 2)
    assert.equal(await clients[0].product.count({ where: { accountId: f.account.id, name: "Esperando bloqueo" } }), 0)
    assert.equal((await clients[0].accountOnboarding.findUniqueOrThrow({ where: { accountId: f.account.id } })).completedAt, null)
  } finally { release(); await holder; await Promise.all([mobile, creating]) }
  await verify(f)
})
