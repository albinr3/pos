import fs from 'node:fs'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import assert from 'node:assert/strict'

const config = dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const url = new URL(config.TEST_DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(url.pathname) || [...url.searchParams.keys()].some(k => k !== 'schema') || (url.searchParams.get('schema') && url.searchParams.get('schema') !== 'public')) throw new Error('Base de prueba local requerida')
const db = new PrismaClient({ datasources: { db: { url: config.TEST_DATABASE_URL } } })
try {
  const accounts = await db.account.findMany({ where: { clerkUserId: { in: [config.FISCAL_TEST_CLERK_USER_A, config.FISCAL_TEST_CLERK_USER_B] } }, include: { users: true, products: true, customers: true, suppliers: true } })
  const extensions = await db.$queryRaw`SELECT encode(extensions.digest('fiscal-test','sha256'),'hex') AS hash, extensions.uuid_generate_v4()::text AS uuid`
  assert.match(extensions[0].hash, /^[0-9a-f]{64}$/)
  assert.match(extensions[0].uuid, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i)
  assert.equal(accounts.length, 2)
  for (const account of accounts) {
    assert.equal(account.users.length, 2)
    assert.equal(account.products.length, 1)
    assert.equal(account.customers.length, 2)
    assert.equal(account.suppliers.length, 1)
    assert.equal(await bcrypt.compare(config.FISCAL_TEST_PIN, account.users.find(u => u.isOwner).passwordHash), true)
    assert.equal(await db.product.count({ where: { accountId: account.id, id: accounts.find(a => a.id !== account.id).products[0].id } }), 0)
  }
  // La comparación directa por accountId no verifica RLS: probar roles reales evita ese falso positivo.
  const anonCount = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE anon')
    return await tx.$queryRaw`SELECT count(*)::int AS n FROM "Account"`
  })
  assert.equal(anonCount[0].n, 0)
  const serviceCount = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE service_role')
    return await tx.$queryRaw`SELECT count(*)::int AS n FROM "Account"`
  })
  assert.equal(serviceCount[0].n, 2)
  try {
    await db.$transaction(async tx => {
      await tx.supplier.create({ data: { accountId: accounts[0].id, name: 'Validación de restricción', creditDays: -1 } })
      // Aunque falte el check, no conservar el registro inválido en la base.
      throw new Error('La restricción de días de crédito no rechazó el dato inválido')
    })
  } catch (error) {
    if (error.code !== 'P2004' && error.code !== 'P2003' && !String(error.message).includes('Supplier_creditDays_check')) throw error
    if (error.code === 'P2003') throw error
  }
  console.log('Comprobados: empresas, usuarios, PIN, datos por cuenta, RLS de roles, restricción de crédito y funciones criptográficas')
} finally { await db.$disconnect() }
