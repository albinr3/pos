import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ts from 'typescript'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server.js'

const config = dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const url = new URL(config.TEST_DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55439' || url.pathname !== '/movopos_fiscal_test_2') throw new Error('Base de prueba no autorizada')
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const require = createRequire(import.meta.url)
function compile(path, deps) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(output, { exports, require(name) { return name in deps ? deps[name] : require(name) }, console, Error })
  return exports
}
try {
  const identities = [config.FISCAL_TEST_CLERK_USER_A, config.FISCAL_TEST_CLERK_USER_B]
  const accounts = await db.account.findMany({ where: { clerkUserId: { in: identities } }, include: { users: true } })
  assert.equal(accounts.length, 2)
  const sanitize = compile('src/lib/sanitize.ts', {})
  let actor = null
  const route = compile('src/app/api/company-settings/route.ts', {
    'next/server': require('next/server'), '@/lib/db': { prisma: db }, '@/lib/sanitize': sanitize,
    '../_helpers/auth': { getCurrentUserFromRequest: async () => actor },
    '@/lib/permission-guard': { ensurePermission: async user => { if (!user.isOwner && !user.canManageSettings) throw new Error('No tienes permiso para modificar ajustes') } },
  })
  const request = (method, body) => new NextRequest('http://localhost/api/company-settings', { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  const shapes = []
  for (const account of accounts) {
    actor = account.users.find(user => user.isOwner); assert.ok(actor)
    const fiscal = await db.fiscalSettings.findUnique({ where: { accountId: account.id } }); assert.equal(fiscal?.enabled ?? false, false)
    const read = await route.GET(request('GET')); assert.equal(read.status, 200); const before = await read.json()
    for (const key of ['company','salesSettings','name','logoUrl','address','phone','defaultViewMode','showItbisOnReceipts','salePricesIncludeItbis','legalTipEnabled','defaultProfitMarginBp']) assert.ok(Object.hasOwn(before,key), `Falta ${key}`)
    const write = await route.PUT(request('PUT', { name: before.name, phone: before.phone, address: before.address, logoUrl: before.logoUrl, defaultViewMode: before.defaultViewMode, showItbisOnReceipts: before.showItbisOnReceipts, salePricesIncludeItbis: before.salePricesIncludeItbis, legalTipEnabled: before.legalTipEnabled }))
    assert.equal(write.status, 200); assert.deepEqual(await write.json(), before)
    assert.deepEqual(await (await route.GET(request('GET'))).json(), before)
    const cashier = account.users.find(user => user.username === 'cajero'); assert.ok(cashier); actor = cashier
    assert.equal((await route.PUT(request('PUT', { name: before.name }))).status, 403)
    shapes.push(before)
  }
  actor = null; assert.equal((await route.GET(request('GET'))).status, 401)
  console.log('Contrato anterior: lectura y guardado sin cambios, 401 y 403 aprobados para dos empresas; Prisma y PostgreSQL reales, autenticación simulada.')
} finally { await db.$disconnect() }
