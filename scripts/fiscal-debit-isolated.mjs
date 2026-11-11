// Usa una base local nueva y nunca modifica la base fiscal ya existente.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"

const config = dotenv.parse(fs.readFileSync(".env.fiscal-test"))
const source = new URL(config.TEST_DATABASE_URL)
if (!["localhost", "127.0.0.1"].includes(source.hostname) || source.port !== "55439" || source.pathname !== "/movopos_fiscal_test_2") throw new Error("Instancia fiscal local no autorizada")
const status = spawnSync(process.execPath, ["scripts/fiscal-test-pg17.mjs", "status"], { stdio: "ignore", windowsHide: true, timeout: 10000 })
if (status.status !== 0) {
  const start = spawnSync(process.execPath, ["scripts/fiscal-test-pg17.mjs", "start"], { stdio: "inherit", windowsHide: true, timeout: 30000 })
  if (start.error || start.status !== 0) throw new Error("No se pudo iniciar PostgreSQL de prueba")
}
const name = `cash_test_stage10_${Date.now()}`
if (!/^cash_test_stage10_\d+$/.test(name)) throw new Error("Nombre de base no autorizado")
const adminUrl = new URL(source), testUrl = new URL(source)
adminUrl.pathname = "/postgres"; adminUrl.search = ""; testUrl.pathname = `/${name}`
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
try {
  const exists = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname=${name}`
  if (exists.length) throw new Error("La base ya existe")
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
} finally { await admin.$disconnect() }
const env = { ...process.env, DATABASE_URL: testUrl.toString(), TEST_DATABASE_URL: testUrl.toString() }
for (const key of Object.keys(env)) if (/^(CLERK|NEXT_PUBLIC_CLERK|LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO)/i.test(key)) env[key] = ""
const setup = spawnSync(process.execPath, ["scripts/setup-fiscal-baseline-db.mjs"], { env, stdio: "inherit", windowsHide: true, timeout: 90000 })
if (setup.error || setup.status !== 0) throw new Error("No se pudo preparar la base aislada")
const core = fs.readFileSync("prisma/migrations/20261109170000_fiscal_document_core/migration.sql", "utf8").replace(/CREATE UNIQUE INDEX "(Sale|Purchase|Return|OperatingExpense)_accountId_id_key"/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "$1_accountId_id_key"')
// db push no instala restricciones ni triggers: sustituir solo tablas fiscales de esta base nueva.
const sql = 'DROP TABLE "FiscalCustomerCreditApplication", "FiscalCustomerCredit", "FiscalAdjustmentApplication", "FiscalAdjustmentOperation", "FiscalAdjustmentEvent", "FiscalAdjustmentLine", "FiscalAdjustment", "FiscalPreparationOperation", "FiscalDocumentRevision", "FiscalSequenceEvent", "FiscalNumberAllocation", "FiscalSequence", "FiscalDocumentLine", "FiscalDocumentReference", "FiscalDocumentEvent", "FiscalDocument" CASCADE;\nALTER TABLE "Return" DROP COLUMN "fiscalAdjustmentId";\nALTER TABLE "AccountReceivable" DROP COLUMN "accountId" CASCADE, DROP COLUMN "debitAdjustmentId" CASCADE;\nALTER TABLE "AccountReceivable" ALTER COLUMN "saleId" SET NOT NULL;\nALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"(id) ON DELETE CASCADE ON UPDATE CASCADE;\n' + core + "\n" + ["20261109180000_fiscal_sequences", "20261110120000_fiscal_preparation", "20261110130000_fiscal_sequence_rollover", "20261110150000_fiscal_adjustment_drafts", "20261110160000_fiscal_adjustment_financial", "20261110170000_fiscal_debit_receivables", "20261110180000_fiscal_adjustment_tenant_integrity"].map(dir => fs.readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8")).join("\n")
const applied = spawnSync(path.resolve("tmp/fiscal-postgres17/pgsql/bin/psql.exe"), ["-X", "-1", "-v", "ON_ERROR_STOP=1", "-h", source.hostname, "-p", source.port, "-U", decodeURIComponent(source.username), "-d", name], { input: sql, encoding: "utf8", windowsHide: true, timeout: 45000, env: { ...env, PGPASSWORD: decodeURIComponent(source.password), PGSSLMODE: "disable" } })
if (applied.error || applied.status !== 0) throw new Error(`No se pudieron aplicar las migraciones: ${applied.error?.message || applied.stderr}`)
const check = spawnSync(process.execPath, ["--import", "tsx", "--test", "scripts/fiscal-debit-isolated.integration.test.mts"], { env, stdio: "inherit", windowsHide: true, timeout: 90000 })
if (check.error || check.status !== 0) throw new Error(`Falló la comprobación de borradores: ${check.error?.message || check.status}`)
console.log(`Borradores comprobados en base local aislada ${name}`)
