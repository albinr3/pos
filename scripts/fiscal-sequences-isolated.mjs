import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

const config = dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const source = new URL(config.TEST_DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(source.hostname) || source.port !== '55439' || source.pathname !== '/movopos_fiscal_test_2') throw Error('Solo se admite la instancia fiscal local aislada')
const name = `cash_test_fiscal_stage5_${Date.now()}`
const adminUrl = new URL(source); adminUrl.pathname = '/postgres'; adminUrl.search = ''
const testUrl = new URL(source); testUrl.pathname = `/${name}`
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
try {
  const exists = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname=${name}`
  if (exists.length || !/^cash_test_fiscal_stage5_\d+$/.test(name)) throw Error('Nombre de base inválido o existente')
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
} finally { await admin.$disconnect() }

const setup = `CREATE TABLE "Account" (id TEXT PRIMARY KEY);
CREATE TABLE "FiscalSettings" ("accountId" TEXT PRIMARY KEY REFERENCES "Account"(id), jurisdiction TEXT, regime TEXT, environment TEXT);
CREATE TABLE "FiscalDocument" (id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "Account"(id), type TEXT NOT NULL, state TEXT NOT NULL, UNIQUE ("accountId", id));
INSERT INTO "Account" (id) VALUES ('a'),('b');
INSERT INTO "FiscalSettings" VALUES ('a','DO','DO_ECF','TEST'),('b','DO','DO_ECF','TEST');
INSERT INTO "FiscalDocument" VALUES ('d1','a','E31','VALIDADO'),('d2','a','E31','VALIDADO'),('d3','a','E31','VALIDADO'),('d4','a','E31','BORRADOR'),('d5','b','E31','VALIDADO'),('r1','a','E41','VALIDADO'),('r2','a','E41','VALIDADO'),('r3','a','E41','VALIDADO');\n` + fs.readFileSync('prisma/migrations/20261109180000_fiscal_sequences/migration.sql', 'utf8') + '\n' + fs.readFileSync('prisma/migrations/20261110130000_fiscal_sequence_rollover/migration.sql', 'utf8')
const psql = path.resolve('tmp/fiscal-postgres17/pgsql/bin/psql.exe')
const run = spawnSync(psql, ['-X', '-1', '-v', 'ON_ERROR_STOP=1', '-h', source.hostname, '-p', source.port, '-U', decodeURIComponent(source.username), '-d', name], { input: setup, encoding: 'utf8', windowsHide: true, env: { ...process.env, PGPASSWORD: decodeURIComponent(source.password), PGSSLMODE: 'disable' }, timeout: 45000 })
if (run.error || run.status !== 0) throw Error(`No se pudo aplicar la migración aislada: ${run.error?.message || run.stderr}`)
console.log('Migración aplicada en base local aislada', name)
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'scripts/fiscal-sequences.integration.test.mts'], { stdio: 'inherit', windowsHide: true, timeout: 120000, env: { ...process.env, DATABASE_URL: testUrl.toString(), FISCAL_STAGE5_DATABASE: name } })
if (result.error || result.status !== 0) throw Error(`Falló la prueba de secuencias: ${result.error?.message || result.status}`)
