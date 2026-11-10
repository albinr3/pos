import { test } from "node:test"
import assert from "node:assert/strict"
import type { Prisma } from "@prisma/client"
import { PrismaClient } from "@prisma/client"
import fs from "node:fs"
import dotenv from "dotenv"
import vm from "node:vm"
import { createRequire } from "node:module"
import ts from "typescript"
import { NextRequest } from "next/server.js"
// tsx expone los módulos TypeScript del proyecto mediante importación dinámica en .mts.
const { findSaleCustomerByIdentification, normalizeDominicanBuyerId, preferredSaleReceipt } = await import("../src/lib/fiscal/core/sale-customer")

const enabled = { enabled: true, jurisdiction: "DO", regime: "DO_ECF", environment: "TEST", configurationStatus: "VALIDATED", version: 1, effectiveFrom: null }
const owner = { id: "u1", accountId: "a1", isOwner: true }

test("la identificación normaliza solo separadores admitidos", () => {
  assert.equal(normalizeDominicanBuyerId(" 101-12345-6 "), "101123456")
  assert.equal(normalizeDominicanBuyerId("001-1234567-8"), "00112345678")
  for (const input of ["RNC 101123456", "101/123456", "123", null]) assert.throws(() => normalizeDominicanBuyerId(input))
})

test("el cliente general propone consumo y se respetan preferencias reconocidas", () => {
  assert.equal(preferredSaleReceipt(true, "E31"), "E32")
  assert.equal(preferredSaleReceipt(false, '["E33","E45","E31"]'), "E45")
  assert.equal(preferredSaleReceipt(false, "E33"), "E32")
  assert.equal(preferredSaleReceipt(false, null), "E32")
})

test("la consulta exige perfil activo y ambos permisos antes de buscar", async () => {
  let searches = 0
  let policy = { ...enabled, enabled: false }
  const db = {
    fiscalSettings: { findUnique: async () => policy },
    $queryRaw: async () => { searches++; return [] },
  } as unknown as Prisma.TransactionClient
  await assert.rejects(findSaleCustomerByIdentification(owner, "101123456", db), (e: any) => e.code === "PROFILE_UNAVAILABLE")
  assert.equal(searches, 0)
  policy = enabled
  await assert.rejects(findSaleCustomerByIdentification({ id: "u", accountId: "a1", canAccessSales: true }, "101123456", db), (e: any) => e.code === "FORBIDDEN")
  assert.equal(searches, 0)
  assert.deepEqual(await findSaleCustomerByIdentification(owner, "101-12345-6", db), { matches: [], hasMore: false })
  assert.equal(searches, 1)
})

test("se devuelve la elección de comprador sin guardar datos ni decidir entre duplicados", async () => {
  const rows = [1, 2].map(n => ({ id: `c${n}`, visualId: n + 1, name: `Cliente ${n}`, fiscalLegalName: null, fiscalIdentification: "101123456", fiscalIdentificationType: "RNC", fiscalIdentificationCountry: "DO", fiscalPreferredReceiptType: "E31", cedula: null, saleDiscountPercentBp: 500 }))
  let queryValues: unknown[] = []
  const db = {
    fiscalSettings: { findUnique: async ({ where }: any) => { assert.equal(where.accountId, "a1"); return enabled } },
    $queryRaw: async (_parts: TemplateStringsArray, ...values: unknown[]) => { queryValues = values; return rows },
  } as unknown as Prisma.TransactionClient
  const result = await findSaleCustomerByIdentification(owner, "101-12345-6", db)
  assert.deepEqual(queryValues, ["a1", "101123456", "101123456"])
  assert.equal(result.matches.length, 2)
  assert.equal(result.matches[0].preferredReceiptType, "E31")
  assert.equal(result.matches[1].saleDiscountPercentBp, 500)
  assert.equal(result.hasMore, false)
})

test("búsqueda real respeta empresa, ficha activa y prioridad fiscal, con rollback", async () => {
  const url = new URL(dotenv.parse(fs.readFileSync(".env.fiscal-test")).TEST_DATABASE_URL)
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55439" || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(url.pathname)) throw new Error("Solo se admite la base fiscal local de pruebas")
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
  const rollback = new Error("ROLLBACK_FISCAL_SALE_CUSTOMER")
  try {
    const accounts = await db.account.findMany({ take: 2, select: { id: true } })
    assert.equal(accounts.length, 2)
    await db.$transaction(async tx => {
      const [a, b] = accounts
      const storedPolicy = { ...enabled, effectiveFrom: new Date() }
      await tx.fiscalSettings.upsert({ where: { accountId: a.id }, create: { accountId: a.id, ...storedPolicy }, update: storedPolicy })
      const mk = async (accountId: string, visualId: number, fields: Record<string, unknown>) => tx.customer.create({ data: { accountId, visualId, name: "Prueba RNC", ...fields } })
      const first = await mk(a.id, 1900000001, { fiscalIdentification: "109-99887-6", fiscalIdentificationCountry: "DO" })
      const second = await mk(a.id, 1900000002, { cedula: "109998876" })
      await mk(a.id, 1900000003, { fiscalIdentification: "999999999", cedula: "109998876" })
      await mk(a.id, 1900000004, { fiscalIdentification: "109998876", isActive: false })
      await mk(b.id, 1900000001, { fiscalIdentification: "109998876" })
      const result = await findSaleCustomerByIdentification({ id: "test", accountId: a.id, isOwner: true }, "109 99887 6", tx)
      assert.deepEqual(new Set(result.matches.map(match => match.id)), new Set([first.id, second.id]))
      await tx.fiscalSettings.update({ where: { accountId: a.id }, data: { enabled: false } })
      await assert.rejects(findSaleCustomerByIdentification({ id: "test", accountId: a.id, isOwner: true }, "109998876", tx), (e: any) => e.code === "PROFILE_UNAVAILABLE")
      throw rollback
    }).catch(error => { if (error !== rollback) throw error })
  } finally {
    await db.$disconnect()
  }
})

test("el handler móvil exige sesión y devuelve respuestas privadas", async () => {
  const require = createRequire(import.meta.url)
  const document = await import("../src/lib/fiscal/core/document")
  const sequences = await import("../src/lib/fiscal/core/sequences")
  let mobileActor: typeof owner | null = null
  let searched: unknown
  const cache = new Map<string, any>()
  function compile(file: string): any {
    if (cache.has(file)) return cache.get(file)
    const exports: any = {}; cache.set(file, exports)
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(js, { exports, console, crypto: globalThis.crypto, require(name: string) {
      if (name === "../../documents/_shared") return compile("src/app/api/fiscal/documents/_shared.ts")
      if (name === "../../_helpers/auth") return { getCurrentUserFromRequest: async () => mobileActor }
      if (name === "@/lib/fiscal/core/document") return document
      if (name === "@/lib/fiscal/core/sequences") return sequences
      if (name === "@/lib/fiscal/core/sale-customer") return { findSaleCustomerByIdentification: async (actor: unknown, value: unknown) => { searched = { actor, value }; return { matches: [], hasMore: false } } }
      return require(name === "next/server" ? "next/server.js" : name)
    } }, { filename: file })
    return exports
  }
  const route = compile("src/app/api/fiscal/sales/customer/route.ts")
  const request = new NextRequest("http://localhost/api/fiscal/sales/customer?identification=101-12345-6", { headers: { "X-Clerk-Authorization": "Bearer test", "X-SubUser-Token": "test" } })
  assert.equal((await route.GET(request)).status, 401)
  mobileActor = owner
  const response = await route.GET(request)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.deepEqual(searched, { actor: owner, value: "101-12345-6" })
  assert.deepEqual(await response.json(), { matches: [], hasMore: false })
})
