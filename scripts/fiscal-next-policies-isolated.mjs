// Crea una base local nueva y ficticia; nunca modifica ni elimina la base fiscal existente.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const config = dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const source = new URL(config.TEST_DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(source.hostname) || source.port !== '55439' || source.pathname !== '/movopos_fiscal_test_2' || [...source.searchParams.keys()].some(k => k !== 'schema')) throw new Error('Instancia fiscal local no autorizada')
const identities = [config.FISCAL_TEST_CLERK_USER_A, config.FISCAL_TEST_CLERK_USER_B]
if (identities.some(id => !/^user_[a-zA-Z0-9]+$/.test(id || '')) || identities[0] === identities[1] || !config.FISCAL_TEST_PIN || config.FISCAL_TEST_ALLOW_LIVE_IDENTITY_LOOKUP !== 'true') throw new Error('Identidades de prueba no autorizadas')
const name = `cash_test_fiscal_next_${Date.now()}`
if (!/^cash_test_fiscal_next_\d+$/.test(name)) throw new Error('Nombre de prueba inválido')
const adminUrl = new URL(source); adminUrl.pathname = '/postgres'; adminUrl.search = ''
const testUrl = new URL(source); testUrl.pathname = `/${name}`
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
try {
  const exists = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname=${name}`
  if (exists.length) throw new Error('La base ya existe; nunca se reemplaza')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
} finally { await admin.$disconnect() }

const setupEnv = { ...process.env, DATABASE_URL: testUrl.toString(), TEST_DATABASE_URL: testUrl.toString() }
const sensitive = /^(CLERK|NEXT_PUBLIC_CLERK|LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO)/i
// No pasar credenciales de servicios a los procesos que solo preparan la base ficticia.
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) if (fs.existsSync(file)) for (const key of Object.keys(dotenv.parse(fs.readFileSync(file)))) if (sensitive.test(key)) setupEnv[key] = ''
for (const key of Object.keys(setupEnv)) if (sensitive.test(key)) setupEnv[key] = ''
const setup = spawnSync(process.execPath, ['scripts/setup-fiscal-baseline-db.mjs'], { env: setupEnv, stdio: 'inherit', windowsHide: true })
if (setup.error || setup.status !== 0) throw new Error('No se pudo preparar la base aislada')
const db = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } })
try {
  const hash = await bcrypt.hash(config.FISCAL_TEST_PIN, 10)
  for (const [index, accountId] of ['baseline-account-rd', 'baseline-account-doprep'].entries()) {
    await db.account.update({ where: { id: accountId }, data: { clerkUserId: identities[index], engagementEmailsEnabled: false } })
    await db.user.updateMany({ where: { accountId, isOwner: true }, data: { username: 'dueno', passwordHash: hash } })
    await db.user.updateMany({ where: { accountId, isOwner: false }, data: { username: 'cajero', passwordHash: hash } })
  }
  // Perfil activado únicamente como fixture aislado: no equivale a habilitación ni se usa un proveedor.
  await db.fiscalSettings.create({ data: { accountId: 'baseline-account-doprep', enabled: true, jurisdiction: 'DO', regime: 'DO_ECF', environment: 'TEST' } })
} finally { await db.$disconnect() }

const run = spawnSync(process.execPath, ['scripts/fiscal-clerk-temporary.mjs', '--next'], { env: { ...process.env, FISCAL_NEXT_ISOLATED_URL: testUrl.toString() }, stdio: 'inherit', windowsHide: true })
if (run.error || run.status !== 0) throw new Error('Falló la comprobación HTTP aislada')
console.log(`Comprobación terminada en base local aislada ${name}`)
