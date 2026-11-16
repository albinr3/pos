import "dotenv/config"
import { Prisma, PrismaClient } from "@prisma/client"
import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import { basename } from "node:path"

const file = process.argv[2]
if (!file) throw new Error('Uso: node scripts/import-taxpayer-registry.mjs "ruta/al/padron.csv"')
const db = new PrismaClient()

// Los valores del archivo original usan ISO-8859-1; conservar las cadenas evita perder ceros iniciales.
function parseCsvLine(line) {
  const fields = []; let field = ""; let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (c === "," && !quoted) { fields.push(field); field = "" }
    else field += c
  }
  if (quoted) throw new Error("Registro CSV incompleto o multilínea")
  fields.push(field); return fields
}

try {
  await db.$transaction(async tx => {
    // La tabla temporal y el reemplazo en una transacción dejan intacto el padrón si falla la importación.
    await tx.$executeRaw`CREATE TEMP TABLE taxpayer_import (identification TEXT PRIMARY KEY, legal_name TEXT NOT NULL) ON COMMIT DROP`
    const lines = createInterface({ input: createReadStream(file, { encoding: "latin1" }), crlfDelay: Infinity })
    let lineNumber = 0; let count = 0; let skipped = 0; let batch = []
    async function flush() {
      if (!batch.length) return
      await tx.$executeRaw(Prisma.sql`INSERT INTO taxpayer_import (identification, legal_name) VALUES ${Prisma.join(batch.map(row => Prisma.sql`(${row[0]}, ${row[1]})`))}`)
      batch = []
    }
    for await (const line of lines) {
      lineNumber++
      if (lineNumber === 1) {
        const header = parseCsvLine(line)
        if (header[0] !== "RNC" || !header[1]?.startsWith("RAZ")) throw new Error("Cabecera de padrón inesperada")
        continue
      }
      if (!line.trim()) continue
      const row = parseCsvLine(line); const id = row[0]?.trim(); const name = row[1]?.trim()
      if (row.length !== 6 || !name) throw new Error(`Registro inválido en línea ${lineNumber}`)
      // No inventar un cero para identificaciones incompletas presentes en el padrón.
      if (!/^(?:[0-9]{9}|[0-9]{11})$/.test(id ?? "")) { skipped++; console.warn(`Identificación inválida omitida en línea ${lineNumber}: ${id}`); continue }
      batch.push([id, name]); count++
      if (batch.length >= 500) await flush()
    }
    await flush()
    if (!count) throw new Error("El padrón está vacío")
    await tx.$executeRaw`DELETE FROM "TaxpayerRegistry"`
    await tx.$executeRaw`INSERT INTO "TaxpayerRegistry" (identification, "legalName") SELECT identification, legal_name FROM taxpayer_import`
    await tx.$executeRaw`INSERT INTO "TaxpayerRegistryImport" (id, source, "recordCount", "importedAt") VALUES (1, ${basename(file)}, ${count}, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET source = EXCLUDED.source, "recordCount" = EXCLUDED."recordCount", "importedAt" = EXCLUDED."importedAt"`
    console.log(`Padrón importado: ${count} registros; ${skipped} omitidos.`)
  }, { timeout: 600000, maxWait: 30000 })
} finally { await db.$disconnect() }
