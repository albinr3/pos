// Crea el escenario anterior y aplica la migración real en una base VACÍA y local explícita.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error("Define TEST_DATABASE_URL; DATABASE_URL nunca se usa como alternativa")
const parsed = new URL(url)
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !/cash_test/.test(parsed.pathname) || ![null, "public"].includes(parsed.searchParams.get("schema"))) throw new Error("Se requiere una base local desechable cash_test en el esquema public")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const db = new PrismaClient({ datasources: { db: { url } } })
try {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`
  if (tables.length) throw new Error("La base de pruebas debe estar vacía. No se borra ninguna base existente")
} finally { await db.$disconnect() }

// Derivar exclusivamente los cambios de esta entrega para ensayar el salto desde el esquema previo.
let schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
schema = schema.replace(/^model (CashControl|CashShift|CashMovement|CashOperation|CashSourceLink) \{[\s\S]*?^\}\r?\n/gm, "")
schema = schema.replace(/^.*\s(?:CashControl|CashShift|CashMovement|CashOperation|CashSourceLink)[?\[\]\s].*\r?\n/gm, "")
schema = schema.replace(/^.*can(?:OperateCashShifts|ViewAllCashShifts|ManageCashShifts|RecordCashMovements).*\r?\n/gm, "")
schema = schema.replace(/(model OperatingExpense \{)([\s\S]*?)(^\})/m, (_, start, body, end) => start + body.replace(/^.*(?:cancelledAt|cancelledBy|cancellationReason|Anular conserva).*\r?\n/gm, "") + end)
const temporary = path.join(root, "tmp", "cash-test-before.prisma")
fs.mkdirSync(path.dirname(temporary), { recursive: true })
fs.writeFileSync(temporary, schema)
const seed = path.join(root, "tmp", "cash-test-fixtures.sql")
fs.writeFileSync(seed, `INSERT INTO "Account" ("id","updatedAt","name","clerkUserId") VALUES ('cash-migration-test',now(),'Migration test','cash-migration-clerk');
INSERT INTO "User" ("id","updatedAt","accountId","name","username","passwordHash","isOwner","canAccessSales","canAccessDailyClose") VALUES
('cash-migration-owner',now(),'cash-migration-test','Owner','owner','test',true,false,false),
('cash-migration-cashier',now(),'cash-migration-test','Cashier','cashier','test',false,true,false),
('cash-migration-reader',now(),'cash-migration-test','Reader','reader','test',false,false,true);`)
function prisma(args) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), ...args], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...process.env, DATABASE_URL: url } })
  if (result.error) throw result.error
  if (result.status) throw new Error("No se pudo preparar la base de pruebas")
}
prisma(["db", "push", "--schema", temporary, "--skip-generate"])
prisma(["db", "execute", "--url", url, "--file", seed])
prisma(["db", "execute", "--url", url, "--file", path.join(root, "prisma/migrations/20261031120000_add_cash_shifts/migration.sql")])
console.log("Base local preparada: esquema previo, datos ficticios y migración aditiva verificados")
