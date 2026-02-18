import { PrismaClient } from "@prisma/client"
import { config as loadEnv } from "dotenv"

loadEnv()

const productionDatabaseUrl = process.env.DATABASE_URL_PROD
if (productionDatabaseUrl) {
  process.env.DATABASE_URL = productionDatabaseUrl
} else if (!process.env.DATABASE_URL) {
  throw new Error("No se encontró DATABASE_URL_PROD ni DATABASE_URL en el entorno.")
}

const prisma = new PrismaClient()

type Args = {
  apply: boolean
  accountId?: string
  toleranceMinutes: number
  limit?: number
}

type Candidate = {
  id: string
  accountId: string
  invoiceCode: string
  oldSoldAt: Date
  oldCreatedAt: Date
  normalizedAt: Date
  diffMinutes: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    toleranceMinutes: 5,
  }

  for (const arg of argv) {
    if (arg === "--apply") {
      args.apply = true
      continue
    }

    if (arg.startsWith("--accountId=")) {
      args.accountId = arg.split("=")[1]
      continue
    }

    if (arg.startsWith("--toleranceMinutes=")) {
      const raw = Number(arg.split("=")[1])
      if (Number.isFinite(raw) && raw >= 0) {
        args.toleranceMinutes = raw
      }
      continue
    }

    if (arg.startsWith("--limit=")) {
      const raw = Number(arg.split("=")[1])
      if (Number.isFinite(raw) && raw > 0) {
        args.limit = Math.trunc(raw)
      }
      continue
    }
  }

  return args
}

function minutesDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60000
}

function normalizeDate(soldAt: Date, createdAt: Date): Date {
  // Regla conservadora para reportes: usar la más antigua.
  return soldAt.getTime() <= createdAt.getTime() ? soldAt : createdAt
}

async function getCandidates(args: Args) {
  const toleranceMs = args.toleranceMinutes * 60 * 1000
  const candidates: Candidate[] = []
  let scanned = 0
  let equalOrClose = 0

  let cursor: string | undefined
  const pageSize = 1000

  while (true) {
    const sales = await prisma.sale.findMany({
      where: {
        ...(args.accountId ? { accountId: args.accountId } : {}),
      },
      orderBy: { id: "asc" },
      take: pageSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        accountId: true,
        invoiceCode: true,
        soldAt: true,
        createdAt: true,
      },
    })

    if (sales.length === 0) break

    for (const sale of sales) {
      scanned++
      const diffMs = Math.abs(sale.soldAt.getTime() - sale.createdAt.getTime())
      if (diffMs <= toleranceMs) {
        equalOrClose++
        continue
      }

      const normalizedAt = normalizeDate(sale.soldAt, sale.createdAt)
      candidates.push({
        id: sale.id,
        accountId: sale.accountId,
        invoiceCode: sale.invoiceCode,
        oldSoldAt: sale.soldAt,
        oldCreatedAt: sale.createdAt,
        normalizedAt,
        diffMinutes: minutesDiff(sale.soldAt, sale.createdAt),
      })

      if (args.limit && candidates.length >= args.limit) {
        return { scanned, equalOrClose, candidates }
      }
    }

    cursor = sales[sales.length - 1]?.id
    if (!cursor) break
  }

  return { scanned, equalOrClose, candidates }
}

async function applyCandidates(candidates: Candidate[]) {
  let updated = 0
  const chunkSize = 100

  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize)
    await prisma.$transaction(
      chunk.map((item) =>
        prisma.sale.update({
          where: { id: item.id },
          data: {
            soldAt: item.normalizedAt,
            createdAt: item.normalizedAt,
          },
        })
      )
    )
    updated += chunk.length
  }

  return updated
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.log("Normalizando timestamps de ventas...")
  console.log(
    `Base de datos objetivo: ${productionDatabaseUrl ? "PRODUCCION (DATABASE_URL_PROD)" : "DATABASE_URL"}`
  )
  console.log(`Modo: ${args.apply ? "APPLY" : "DRY-RUN"}`)
  console.log(`Tolerancia: ${args.toleranceMinutes} minuto(s)`)
  if (args.accountId) console.log(`Account: ${args.accountId}`)
  if (args.limit) console.log(`Límite de candidatos: ${args.limit}`)
  console.log("")

  const { scanned, equalOrClose, candidates } = await getCandidates(args)
  console.log(`Ventas escaneadas: ${scanned}`)
  console.log(`Ventas sin diferencia relevante: ${equalOrClose}`)
  console.log(`Ventas candidatas a normalizar: ${candidates.length}`)

  if (candidates.length > 0) {
    console.log("\nMuestra (primeras 20):")
    for (const item of candidates.slice(0, 20)) {
      console.log(
        `- ${item.invoiceCode} (${item.id}) | soldAt=${item.oldSoldAt.toISOString()} | createdAt=${item.oldCreatedAt.toISOString()} | normalizado=${item.normalizedAt.toISOString()} | diff=${item.diffMinutes.toFixed(1)}m`
      )
    }
  }

  if (!args.apply) {
    console.log("\nDry-run completado. Para aplicar cambios usa --apply.")
    return
  }

  if (candidates.length === 0) {
    console.log("\nNo hay cambios para aplicar.")
    return
  }

  const updated = await applyCandidates(candidates)
  console.log(`\n✅ Ventas actualizadas: ${updated}`)
}

main()
  .catch((error) => {
    console.error("Error:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
