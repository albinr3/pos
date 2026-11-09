// Crea bases nuevas de pruebas; nunca usa DATABASE_URL ni elimina bases existentes.
import fs from 'node:fs'
import dotenv from 'dotenv'
import { spawnSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const config = dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const source = new URL(config.TEST_DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(source.hostname) || source.port !== '55439' || source.pathname !== '/movopos_fiscal_test_2' || [...source.searchParams.keys()].some(key => key !== 'schema')) throw new Error('Se requiere la instancia local aislada PostgreSQL 17.6')
const adminUrl = new URL(source); adminUrl.pathname = '/postgres'; adminUrl.search = ''
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
const suffix = Date.now().toString()
const allSuites = [
  { name: `cash_test_fiscal_cash_${suffix}`, setup: 'scripts/setup-cash-test-db.mjs', test: 'scripts/cash-shifts.integration.test.mjs' },
  { name: `cash_test_fiscal_purchase_${suffix}`, setup: 'scripts/setup-purchase-credit-test-db.mjs', test: 'scripts/purchase-credit.integration.test.mjs' },
  { name: `cash_test_fiscal_baseline_${suffix}`, setup: 'scripts/setup-fiscal-baseline-db.mjs', test: 'scripts/fiscal-baseline-scenarios.test.mjs' },
]
const onlyBaseline = process.argv.includes('--baseline-only')
const suites = onlyBaseline ? [allSuites[2]] : allSuites
function run(args, url) {
  // No pasar al proceso credenciales de integraciones externas desde el entorno padre.
  const env = { ...process.env, TEST_DATABASE_URL: url, DATABASE_URL: url }
  // Un valor vacío también impide que dotenv vuelva a cargar el secreto desde .env.
  const sensitive = /^(CLERK|NEXT_PUBLIC_CLERK|LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO)/i
  for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    if (fs.existsSync(file)) for (const key of Object.keys(dotenv.parse(fs.readFileSync(file)))) if (sensitive.test(key)) env[key] = ''
  }
  for (const key of Object.keys(env)) if (sensitive.test(key)) env[key] = ''
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit', windowsHide: true })
  if (result.error || result.status !== 0) throw new Error(`La suite terminó con código ${result.status ?? 'desconocido'}`)
}
try {
  for (const suite of suites) {
    if (!/^cash_test_fiscal_(cash|purchase|baseline)_\d+$/.test(suite.name)) throw new Error('Nombre de base no permitido')
    const exists = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname=${suite.name}`
    if (exists.length) throw new Error('La base ya existe; nunca se reemplaza')
    await admin.$executeRawUnsafe(`CREATE DATABASE "${suite.name}"`)
    const testUrl = new URL(source); testUrl.pathname = `/${suite.name}`
    console.log(`Preparando base aislada ${suite.name}`)
    run([suite.setup], testUrl.toString())
    run(['--test', '--experimental-test-isolation=none', suite.test], testUrl.toString())
  }
  console.log('Suites de integración fiscal completadas con éxito en bases separadas')
} finally { await admin.$disconnect() }
