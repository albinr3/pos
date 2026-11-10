import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { NextRequest } from 'next/server.js'

// tsx expone los módulos TypeScript del proyecto mediante importación dinámica en .mts.
const { prisma } = await import('../src/lib/db')
const sequenceService = await import('../src/lib/fiscal/core/sequences')
const { availability, createSequence, getSequence, getSequenceHistory, listSequences, reserveFiscalNumber, updateSequence, voidFiscalAllocation } = sequenceService

const url = new URL(process.env.DATABASE_URL!)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55439' || !/^\/cash_test_fiscal_stage5_\d+$/.test(url.pathname) || url.pathname.slice(1) !== process.env.FISCAL_STAGE5_DATABASE) throw Error('Base fiscal aislada requerida')
const owner = { id: 'owner-a', accountId: 'a', isOwner: true }, cashier = { id: 'cashier-a', accountId: 'a', canPrepareFiscalDocuments: true }, cashier2 = { id: 'cashier-2', accountId: 'a', canPrepareFiscalDocuments: true }, other = { id: 'owner-b', accountId: 'b', isOwner: true }
const input = { type: 'E31', environment: 'TEST', rangeStart: '1', rangeEnd: '2', expiresOn: '2099-12-31', active: true, authorizationRef: 'test', notes: null, reason: 'Prueba' }

test('rangos, concurrencia, rollback, reintento y aislamiento', async () => {
  try {
    const seq = await createSequence(owner, input)
    await assert.rejects(createSequence(owner, { ...input, active: false }), /superpone/)
    await assert.rejects(createSequence(owner, { ...input, rangeStart: '3', rangeEnd: '4' }), /activo/)
    await assert.rejects(getSequence(other, seq.id), /no encontrada/)
    await assert.rejects(listSequences(cashier), /permiso/)
    await assert.rejects(createSequence(owner, { ...input, lastNumber: '1' }), /no admitidos/)
    await assert.rejects(updateSequence(owner, seq.id, { expectedVersion: 3, active: true, expiresOn: input.expiresOn, authorizationRef: null, notes: null, reason: 'test' }), /cambió/)
    await assert.rejects(prisma.$transaction(async tx => { await reserveFiscalNumber(tx, cashier, 'd3', 'E31'); throw Error('rollback intencional') }), /rollback intencional/)
    assert.equal((await getSequence(owner, seq.id)).lastNumber, '0')
    const [a, b] = await Promise.all([prisma.$transaction(tx => reserveFiscalNumber(tx, cashier, 'd1', 'E31')), prisma.$transaction(tx => reserveFiscalNumber(tx, cashier2, 'd2', 'E31'))])
    assert.deepEqual(new Set([a.eNcf, b.eNcf]), new Set(['E310000000001', 'E310000000002']))
    const repeat = await prisma.$transaction(tx => reserveFiscalNumber(tx, cashier, 'd1', 'E31'))
    assert.equal(repeat.eNcf, a.eNcf)
    await assert.rejects(prisma.$transaction(tx => reserveFiscalNumber(tx, cashier, 'd3', 'E31')), /disponible/)
    await assert.rejects(prisma.$transaction(tx => reserveFiscalNumber(tx, cashier, 'd4', 'E31')), /validado/)
    await assert.rejects(prisma.$transaction(tx => reserveFiscalNumber(tx, cashier, 'd5', 'E31')), /no encontrado/)
    const available = await availability(cashier, 'E31')
    assert.equal(available.data[0].remaining, '0'); assert.equal(available.data[0].exhausted, true); assert.equal(available.data[0].usable, false)
    assert.equal('authorizationRef' in available.data[0], false)
    await prisma.$transaction(tx => voidFiscalAllocation(tx, cashier, 'd1', 'Error de prueba'))
    await assert.rejects(prisma.$transaction(tx => reserveFiscalNumber(tx, cashier, 'd1', 'E31')), /reutilizarse/)
    assert.equal((await getSequence(owner, seq.id)).lastNumber, '2')
    assert.equal((await getSequenceHistory(owner, seq.id)).data.length, 5)
    const expired = await createSequence(owner, { ...input, type: 'E33', expiresOn: '2000-01-01' })
    assert.equal(expired.expired, true); assert.equal(expired.usable, false)
    await assert.rejects(createSequence(owner, { ...input, type: 'E32' }), /vencimiento/)
    const noExpiry = await createSequence(owner, { ...input, type: 'E32', expiresOn: null })
    assert.equal(noExpiry.expiresOn, null)
    const second = await createSequence(other, input)
    assert.equal(second.lastNumber, '0')
    const first = await createSequence(owner, { ...input, type: 'E41', rangeStart: '10', rangeEnd: '10' })
    const expiredNext = await createSequence(owner, { ...input, type: 'E41', active: false, readyForRollover: true, rangeStart: '11', rangeEnd: '11', expiresOn: '2000-01-01' })
    const retired = await createSequence(owner, { ...input, type: 'E41', active: false, rangeStart: '12', rangeEnd: '12' })
    const later = await createSequence(owner, { ...input, type: 'E41', active: false, readyForRollover: true, rangeStart: '30', rangeEnd: '30' })
    const next = await createSequence(owner, { ...input, type: 'E41', active: false, readyForRollover: true, rangeStart: '20', rangeEnd: '21' })
    await assert.rejects(prisma.$transaction(async tx => { await reserveFiscalNumber(tx, cashier, 'r1', 'E41'); throw Error('rollback relevo') }), /rollback relevo/)
    assert.equal((await getSequence(owner, first.id)).active, true)
    assert.equal((await getSequence(owner, first.id)).lastNumber, '9')
    assert.equal((await getSequence(owner, next.id)).readyForRollover, true)
    const [r1, r2] = await Promise.all([prisma.$transaction(tx => reserveFiscalNumber(tx, cashier, 'r1', 'E41')), prisma.$transaction(tx => reserveFiscalNumber(tx, cashier2, 'r2', 'E41'))])
    assert.deepEqual(new Set([r1.eNcf, r2.eNcf]), new Set(['E410000000010', 'E410000000020']))
    assert.equal((await prisma.$transaction(tx => reserveFiscalNumber(tx, cashier, 'r1', 'E41'))).eNcf, r1.eNcf)
    assert.equal((await getSequence(owner, first.id)).active, false)
    assert.equal((await getSequence(owner, next.id)).active, true)
    assert.equal((await getSequence(owner, expiredNext.id)).active, false)
    assert.equal((await getSequence(owner, retired.id)).active, false)
    assert.equal((await getSequence(owner, later.id)).readyForRollover, true)
    assert.equal((await getSequenceHistory(owner, first.id)).data.filter((e: any) => e.action === 'ROLLOVER').length, 1)
    assert.equal((await getSequenceHistory(owner, next.id)).data.filter((e: any) => e.action === 'ROLLOVER').length, 1)
    await prisma.$transaction(tx => reserveFiscalNumber(tx, cashier, 'r3', 'E41'))
    assert.equal((await getSequence(owner, later.id)).active, true)
    // Ejecutar los handlers móviles con autenticación simulada y la base PostgreSQL real.
    const require = createRequire(import.meta.url)
    let mobileActor: unknown = null
    const modules = new Map<string, Record<string, any>>()
    function compile(file: string): Record<string, any> {
      if (modules.has(file)) return modules.get(file)!
      const exports: Record<string, any> = {}; modules.set(file, exports)
      const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
      vm.runInNewContext(js, { exports, console, crypto, require(name: string) {
        if (name === '@/lib/fiscal/core/sequences') return sequenceService
        if (name === '../../_helpers/auth') return { getCurrentUserFromRequest: async () => mobileActor }
        if (name === './_shared' || name === '../_shared') return compile('src/app/api/fiscal/sequences/_shared.ts')
        return require(name === 'next/server' ? 'next/server.js' : name)
      } }, { filename: file })
      return exports
    }
    const routes = compile('src/app/api/fiscal/sequences/route.ts')
    const detail = compile('src/app/api/fiscal/sequences/[id]/route.ts')
    const availableRoute = compile('src/app/api/fiscal/sequences/availability/route.ts')
    let response = await routes.GET(new NextRequest('http://localhost/api/fiscal/sequences'))
    assert.equal(response.status, 401)
    mobileActor = cashier
    response = await routes.GET(new NextRequest('http://localhost/api/fiscal/sequences')); assert.equal(response.status, 403)
    response = await availableRoute.GET(new NextRequest('http://localhost/api/fiscal/sequences/availability?type=E31')); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store')
    mobileActor = other
    response = await detail.GET(new NextRequest(`http://localhost/api/fiscal/sequences/${seq.id}`), { params: Promise.resolve({ id: seq.id }) }); assert.equal(response.status, 404)
    mobileActor = owner
    response = await routes.POST(new NextRequest('http://localhost/api/fiscal/sequences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, type: 'E34', expiresOn: null }) })); assert.equal(response.status, 201)
    response = await routes.POST(new NextRequest('http://localhost/api/fiscal/sequences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, type: 'E34', expiresOn: null, active: false, readyForRollover: true, rangeStart: '3', rangeEnd: '4' }) })); assert.equal(response.status, 201)
    const prepared = await response.json(); assert.equal(prepared.readyForRollover, true)
    response = await detail.PATCH(new NextRequest(`http://localhost/api/fiscal/sequences/${prepared.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: prepared.version, expiresOn: null, active: false, authorizationRef: null, notes: null, reason: 'Cliente anterior' }) }), { params: Promise.resolve({ id: prepared.id }) }); assert.equal(response.status, 200)
    assert.equal((await response.json()).readyForRollover, true)
    response = await routes.POST(new NextRequest('http://localhost/api/fiscal/sequences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, lastNumber: '2' }) })); assert.equal(response.status, 400)
    await assert.rejects(prisma.$executeRaw`DELETE FROM "FiscalSequence" WHERE id=${seq.id}`)
    await assert.rejects(prisma.$executeRaw`UPDATE "FiscalSequence" SET "lastNumber"=0 WHERE id=${seq.id}`)
    await assert.rejects(prisma.$executeRaw`UPDATE "FiscalSequenceEvent" SET reason='cambio' WHERE "sequenceId"=${seq.id}`)
  } finally { await prisma.$disconnect() }
})
