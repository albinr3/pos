import fs from "node:fs"
import dotenv from "dotenv"
import { spawnSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

// Nunca heredar DATABASE_URL ni secretos de servicios externos para este entorno.
const filename = ".env.fiscal-test"
if (!fs.existsSync(filename)) throw new Error(`Falta ${filename}; consulta docs/entorno-pruebas-fiscales.md`)
const config = dotenv.parse(fs.readFileSync(filename))
const raw = config.TEST_DATABASE_URL
if (!raw) throw new Error("Falta TEST_DATABASE_URL")
const url = new URL(raw)
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(url.pathname) || [...url.searchParams.keys()].some(key => key !== 'schema') || (url.searchParams.get('schema') && url.searchParams.get('schema') !== 'public')) throw new Error("Solo se permite una base local movopos_fiscal_test en public")
const action = process.argv[2]
const prisma = new PrismaClient({ datasources: { db: { url: raw } } })
const run = (program, args, env) => {
  const result = spawnSync(program, args, { env, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`El proceso terminó con código ${result.status}`)
}

try {
  if (action === 'create') {
    const name = url.pathname.slice(1)
    const maintenanceUrl = new URL(raw); maintenanceUrl.pathname = '/postgres'; maintenanceUrl.search = ''
    const admin = new PrismaClient({ datasources: { db: { url: maintenanceUrl.toString() } } })
    try {
      const existing = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${name}`
      if (existing.length) throw new Error('La base ya existe; no se reemplaza ni se borra')
      // El nombre está validado estrictamente arriba, antes de interpolarlo en SQL.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
      console.log(`Base vacía creada: ${name}`)
    } finally { await admin.$disconnect() }
  } else if (action === 'setup') {
    const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`
    if (tables.length) throw new Error('La base debe estar vacía; no se elimina ni modifica una base existente')
    await prisma.$disconnect()
    run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { ...process.env, DATABASE_URL: raw })
    console.log('Esquema instalado en la base de prueba. Falta crear las cuentas ficticias.')
  } else if (action === 'constraints') {
    // Los cambios se aplican juntos y solo sobre la URL local validada arriba.
    const sql = fs.readFileSync('scripts/fiscal-test-constraints.sql', 'utf8').replace(/^--.*$/gm, '')
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean)
    await prisma.$transaction(async tx => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement)
    })
    console.log('Restricciones e índices de las migraciones aplicados en la base de prueba')
  } else if (action === 'seed') {
    const ids = [config.FISCAL_TEST_CLERK_USER_A, config.FISCAL_TEST_CLERK_USER_B]
    // La clave live solo se admite para la consulta de identidades autorizada explícitamente;
    // el servidor sigue bloqueado para impedir acciones sobre la instancia de producción.
    const permittedKey = config.CLERK_SECRET_KEY?.startsWith('sk_test_') || (config.FISCAL_TEST_ALLOW_LIVE_IDENTITY_LOOKUP === 'true' && config.CLERK_SECRET_KEY?.startsWith('sk_live_'))
    if (!permittedKey || ids.some(id => !/^user_[a-zA-Z0-9]+$/.test(id || '')) || ids[0] === ids[1] || !/^\d{4,8}$/.test(config.FISCAL_TEST_PIN || '')) throw new Error('Configura dos identidades Clerk distintas, una clave permitida y PIN de 4 a 8 dígitos')
    for (const id of ids) {
      const response = await fetch(`https://api.clerk.com/v1/users/${id}`, { headers: { Authorization: `Bearer ${config.CLERK_SECRET_KEY}` } })
      if (!response.ok) throw new Error('No se pudo verificar una identidad en la instancia Clerk de prueba')
    }
    const hash = await bcrypt.hash(config.FISCAL_TEST_PIN, 10)
    await prisma.$transaction(async tx => {
      if (await tx.account.count()) throw new Error('Solo se crean fixtures en una base sin empresas; no se sobrescriben datos')
      for (const [index, clerkUserId] of ids.entries()) {
        const account = await tx.account.create({ data: { name: `Fiscal prueba ${index + 1}`, clerkUserId, engagementEmailsEnabled: false } })
        const accountId = account.id
        await tx.user.create({ data: { accountId, name: 'Dueño de prueba', username: 'dueno', passwordHash: hash, role: 'ADMIN', isOwner: true } })
        await tx.user.create({ data: { accountId, name: 'Cajero de prueba', username: 'cajero', passwordHash: hash, canAccessSales: true, canOperateCashShifts: true } })
        await tx.companySettings.create({ data: { accountId, name: account.name, phone: '8090000000', address: 'Dirección de prueba' } })
        await tx.billingSubscription.create({ data: { accountId, status: 'ACTIVE' } })
        await tx.accountOnboarding.create({ data: { accountId, completedAt: new Date(), initialSetupCompletedAt: new Date() } })
        await tx.invoiceSequence.create({ data: { accountId, series: 'A' } })
        await tx.returnSequence.create({ data: { accountId } })
        await tx.quoteSequence.create({ data: { accountId } })
        await tx.customerSequence.create({ data: { accountId, lastNumber: 2 } })
        await tx.productSequence.create({ data: { accountId, lastNumber: 1 } })
        await tx.customer.createMany({ data: [{ accountId, visualId: 1, name: 'Cliente general', isGeneric: true }, { accountId, visualId: 2, name: 'Cliente de prueba', creditEnabled: true, creditDays: 30 }] })
        const supplier = await tx.supplier.create({ data: { accountId, name: 'Proveedor de prueba', creditDays: 30 } })
        await tx.product.create({ data: { accountId, productId: 1, name: 'Producto de prueba', priceCents: 10000, costCents: 6000, stock: 50, supplierId: supplier.id } })
      }
    })
    console.log('Dos empresas y sus usuarios ficticios creados en la base de prueba')
  } else if (action === 'check') {
    const rows = await prisma.$queryRaw`SELECT current_database() AS name`
    if (rows[0].name !== url.pathname.slice(1)) throw new Error('La base conectada no coincide con la solicitada')
    console.log(`Conexión local comprobada: ${rows[0].name}`)
  } else if (action === 'dev') {
    // Expo y otros servicios admiten peticiones sin credenciales: limpiar variables no los bloquea.
    throw new Error('Inicio bloqueado: falta aislar y verificar todas las salidas externas del entorno de prueba')
  } else throw new Error('Usa create, setup, constraints, seed, check o dev')
} finally { await prisma.$disconnect() }
