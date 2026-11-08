// Base nueva y exclusivamente local. Nunca usar DATABASE_URL como alternativa.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
const value = process.env.TEST_DATABASE_URL
if (!value) throw new Error("Define TEST_DATABASE_URL")
const url = new URL(value)
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/pos_onboarding_test(?:_\d+)?$/.test(url.pathname) || url.search) throw new Error("Solo una base local pos_onboarding_test, sin parámetros")
const database = url.pathname.slice(1), adminUrl = new URL(url)
adminUrl.pathname = "/postgres"
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })
try {
  const exists = await admin.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${database}`
  if (exists.length) throw new Error("La base ya existe; elige otro sufijo. No se borra ni modifica.")
  await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`)
} finally { await admin.$disconnect() }
const db = new PrismaClient({ datasources: { db: { url: value } } })
try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const schemaFile = path.join(root, "prisma/schema.prisma")
  const cli = path.join(root, "node_modules/prisma/build/index.js")
  const ddl = execFileSync(process.execPath, [cli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", schemaFile, "--script"], { cwd: root, encoding: "utf8", env: { ...process.env, DATABASE_URL: value } })
  for (const statement of ddl.replace(/^--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement)
  console.log("Base local de onboarding creada con el esquema actual.")
} finally { await db.$disconnect() }
