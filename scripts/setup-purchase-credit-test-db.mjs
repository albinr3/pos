// Preparación destructiva prohibida: solo crear tablas en una base VACÍA, local y explícita.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error("Define TEST_DATABASE_URL; DATABASE_URL no se usa como alternativa")
const parsed = new URL(url)
if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !/cash_test/.test(parsed.pathname) || ![null, "public"].includes(parsed.searchParams.get("schema"))) throw new Error("Se requiere una base local desechable cash_test en public")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), db = new PrismaClient({ datasources: { db: { url } } })
try {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`
  if (tables.length) throw new Error("La base debe estar vacía. No se borra ninguna tabla existente")
} finally { await db.$disconnect() }

// Derivar el esquema anterior quitando únicamente los cambios de esta entrega.
let schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")
schema = schema.replace(/^enum (PurchaseType|APOpenStatus) \{[\s\S]*?^\}\r?\n/gm, "")
schema = schema.replace(/^model (AccountPayable|SupplierPayment|PurchaseOperation) \{[\s\S]*?^\}\r?\n/gm, "")
schema = schema.replace(/^.*\s(?:AccountPayable|SupplierPayment|PurchaseOperation)[?\[\]\s].*\r?\n/gm, "")
schema = schema.replace(/^.*can(?:AccessAccountsPayable|RegisterSupplierPayments|CancelSupplierPayments).*\r?\n/gm, "")
schema = schema.replace(/^.*SUPPLIER_PAYMENT_(?:CREATED|CANCELLED).*\r?\n/gm, "")
schema = schema.replace(/(model Supplier \{)([\s\S]*?)(^\})/m, (_, a, b, c) => a + b.replace(/^.*(?:creditDays|purchases Purchase\[\]).*\r?\n/gm, "") + c)
schema = schema.replace(/(model Purchase \{)([\s\S]*?)(^\})/m, (_, a, b, c) => a + b.replace(/^.*(?:PurchaseType|supplierId|supplier Supplier\?).*\r?\n/gm, "") + c)
const temporary = path.join(root, "tmp/cash-credit-before.prisma")
fs.mkdirSync(path.dirname(temporary), { recursive: true }); fs.writeFileSync(temporary, schema)
const fixture = path.join(root, "tmp/cash-credit-fixture.sql")
fs.writeFileSync(fixture, `INSERT INTO "Account" ("id","updatedAt","name","clerkUserId") VALUES ('credit-migration-business',now(),'Fixture migracion','credit-migration-clerk');
INSERT INTO "User" ("id","updatedAt","accountId","name","username","passwordHash","isOwner") VALUES ('credit-migration-user',now(),'credit-migration-business','Prueba','prueba','test-only',true);
INSERT INTO "Supplier" ("id","updatedAt","accountId","name") VALUES ('credit-migration-supplier',now(),'credit-migration-business','Proveedor previo');
INSERT INTO "Purchase" ("id","updatedAt","accountId","userId","supplierName","totalCents") VALUES ('credit-migration-purchase',now(),'credit-migration-business','credit-migration-user','Proveedor previo',70000);`)
function prisma(args) {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), ...args], { cwd: root, env: { ...process.env, DATABASE_URL: url }, windowsHide: true, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status) throw new Error("Falló la preparación de la base local")
}
prisma(["db", "push", "--schema", temporary, "--skip-generate"])
prisma(["db", "execute", "--url", url, "--file", fixture])
prisma(["db", "execute", "--url", url, "--file", path.join(root, "prisma/migrations/20261101160000_purchase_credit/migration.sql")])
// Comprobar también el backfill de un pago creado con el esquema de la primera versión.
const paymentFixture = path.join(root, "tmp/cash-credit-payment-fixture.sql")
fs.writeFileSync(paymentFixture, `INSERT INTO "TreasuryAccount" ("id","updatedAt","accountId","name","type") VALUES ('credit-migration-bank',now(),'credit-migration-business','Banco de migracion','BANCO');
INSERT INTO "Purchase" ("id","updatedAt","accountId","userId","supplierId","supplierName","type","totalCents") VALUES ('credit-snapshot-purchase',now(),'credit-migration-business','credit-migration-user','credit-migration-supplier','Proveedor registrado al comprar','CREDITO',100000);
INSERT INTO "AccountPayable" ("id","updatedAt","accountId","purchaseId","supplierId","totalCents","balanceCents","dueDate","status") VALUES ('credit-snapshot-ap',now(),'credit-migration-business','credit-snapshot-purchase','credit-migration-supplier',100000,90000,'2026-12-01','PARCIAL');
INSERT INTO "SupplierPayment" ("id","accountId","apId","userId","amountCents","method","treasuryAccountId","reference") VALUES ('credit-snapshot-payment','credit-migration-business','credit-snapshot-ap','credit-migration-user',10000,'TRANSFERENCIA','credit-migration-bank','PP-MIGRATION');`)
prisma(["db", "execute", "--url", url, "--file", paymentFixture])
prisma(["db", "execute", "--url", url, "--file", path.join(root, "prisma/migrations/20261101170000_supplier_payment_snapshots/migration.sql")])
console.log("Migración aplicada sobre el esquema previo y una compra ficticia; lista para integración")
