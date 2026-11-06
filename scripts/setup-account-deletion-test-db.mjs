// Solo crear una base de pruebas local VACÍA. Nunca migrar DATABASE_URL ni reutilizar tablas existentes.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PrismaClient } from "@prisma/client"

const value = process.env.TEST_DATABASE_URL
if (!value) throw new Error("Define TEST_DATABASE_URL; DATABASE_URL no se usa como alternativa")
const url = new URL(value)
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/pos_account_deletion_test(?:_\d+)?$/.test(url.pathname) || url.search) {
  throw new Error("Se requiere una base local pos_account_deletion_test, sin parámetros")
}
const database = url.pathname.slice(1), adminUrl = new URL(url)
adminUrl.pathname = "/postgres"
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
try {
  const exists = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${database}`
  if (exists.length) throw new Error("La base de pruebas ya existe; elige un sufijo numérico nuevo. No se borra ni modifica")
  await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`)
} finally { await admin.$disconnect() }

const db = new PrismaClient({ datasources: { db: { url: value } } })
try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const { execFileSync } = await import("node:child_process")
  const schemaFile = path.join(root, "prisma/schema.prisma")
  // El esquema previo permite verificar la migración real de esta entrega sobre datos existentes.
  let schema = fs.readFileSync(schemaFile, "utf8")
    .replace(/^enum AccountDeletionStage \{[\s\S]*?^\}\r?\n/gm, "")
    .replace(/^model AccountDeletion \{[\s\S]*?^\}\r?\n/gm, "")
    .replace(/^.*\sdeletion(?:RequestedAt|PinAttempts|PinWindowStartedAt)\s.*\r?\n/gm, "")
  const temporary = path.join(root, "tmp/account-deletion-before.prisma")
  fs.mkdirSync(path.dirname(temporary), { recursive: true })
  fs.writeFileSync(temporary, schema)
  const cli = path.join(root, "node_modules/prisma/build/index.js")
  const before = execFileSync(process.execPath, [cli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", temporary, "--script"], { cwd: root, encoding: "utf8", env: { ...process.env, DATABASE_URL: value } })
  // Prisma emite DDL separado por ';'; el esquema no contiene funciones ni cuerpos con delimitadores.
  for (const statement of before.replace(/^--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement)
  await db.$executeRawUnsafe(`INSERT INTO "Account" (id, "updatedAt", name, "clerkUserId") VALUES ('deletion-migration-fixture', now(), 'Migración de prueba', 'migration-clerk-fixture')`)
  const migration = fs.readFileSync(path.join(root, "prisma/migrations/20261105120000_add_account_deletion/migration.sql"), "utf8")
  for (const statement of migration.replace(/^--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement)
  console.log("Base local creada y migración de eliminación aplicada a un negocio existente.")
} finally { await db.$disconnect() }
