// Solo usa la base fiscal local y revierte todas las escrituras de activación.
import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ts from 'typescript'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

const config = dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const url = new URL(config.TEST_DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55439' || url.pathname !== '/movopos_fiscal_test_2') throw Error('Base fiscal local no autorizada')
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const require = createRequire(import.meta.url)
const source = ts.transpileModule(fs.readFileSync('src/lib/fiscal/core/settings.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const rollback = new Error('ROLLBACK_INTENCIONAL')
try {
  const accounts = await db.account.findMany({ where: { clerkUserId: { in: [config.FISCAL_TEST_CLERK_USER_A, config.FISCAL_TEST_CLERK_USER_B] } }, include: { users: { where: { isOwner: true } } } })
  assert.equal(accounts.length, 2)
  const account = accounts[0], other = accounts[1], owner = account.users[0]
  assert.ok(owner)
  const otherBefore = await db.fiscalSettings.findUnique({ where: { accountId: other.id } })
  try {
    await db.$transaction(async tx => {
      const exports = {}
      vm.runInNewContext(source, { exports, require(name) {
        if (name === '@/lib/db') return { prisma: { fiscalSettings: tx.fiscalSettings, $transaction: fn => fn(tx) } }
        if (name === '@/lib/permissions') return { hasPermission: user => !!user.isOwner }
        return require(name)
      } })
      const actor = { id: owner.id, accountId: account.id, isOwner: true }
      const current = await exports.getFiscalSettings(actor)
      const body = { expectedVersion: current.version, jurisdiction: 'DO', regime: 'DO_ECF', environment: 'TEST', legalName: 'Empresa ficticia', taxId: '123456789', fiscalAddress: 'Dirección ficticia', fiscalEmail: 'fiscal@example.test', fiscalPhone: null, enabled: true }
      const activated = await exports.updateFiscalSettings(actor, body)
      assert.equal(activated.enabled, true)
      assert.equal((await tx.fiscalSettings.findUnique({ where: { accountId: account.id } })).enabled, true)
      const audited = await tx.fiscalPolicyChange.findFirst({ where: { accountId: account.id, version: activated.version } })
      assert.equal(audited.policy.enabled, true)
      const deactivated = await exports.updateFiscalSettings(actor, { ...body, expectedVersion: activated.version, enabled: false })
      assert.equal(deactivated.enabled, false)
      assert.deepEqual(await tx.fiscalSettings.findUnique({ where: { accountId: other.id } }), otherBefore)
      throw rollback
    }, { timeout: 20000 })
    throw Error('No se produjo la reversión esperada')
  } catch (error) { if (error !== rollback) throw error }
  assert.deepEqual(await db.fiscalSettings.findUnique({ where: { accountId: other.id } }), otherBefore)
  console.log('Activación, desactivación, auditoría y aislamiento comprobados en PostgreSQL local; cambios revertidos.')
} finally { await db.$disconnect() }
