import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"

type Actor = PermissionAwareUser & { accountId: string }
type Summary = { saleId: string; id: string; type: string; state: string; eNcf: string | null }

async function mayView(actor: Actor) {
  if (!hasPermission(actor, "canViewFiscalDocuments")) return false
  const settings = await prisma.fiscalSettings.findUnique({ where: { accountId: actor.accountId }, select: { enabled: true, jurisdiction: true, regime: true } })
  return !!settings?.enabled && settings.jurisdiction === "DO" && settings.regime === "DO_ECF"
}

export async function getFiscalSaleSummaries(actor: Actor, saleIds: string[]) {
  if (!await mayView(actor)) return null
  if (!saleIds.length) return new Map<string, Summary>()
  const rows = await prisma.$queryRaw<Summary[]>`SELECT d."saleId",d.id,d.type,d.state,a."eNcf" FROM "FiscalDocument" d LEFT JOIN "FiscalNumberAllocation" a ON a."accountId"=d."accountId" AND a."documentId"=d.id WHERE d."accountId"=${actor.accountId} AND d."saleId" IN (${Prisma.join(saleIds)}) AND d.state <> 'DESCARTADO'`
  return new Map(rows.map(row => [row.saleId, row]))
}

export async function findFiscalSaleIds(actor: Actor, query: string) {
  // Solo una búsqueda con formato e-NCF necesita consultar el índice fiscal.
  if (!/^E(?:31|32|44|45|46)\d{0,10}$/i.test(query) || !await mayView(actor)) return []
  const prefix = `${query.toUpperCase()}%`
  const rows = await prisma.$queryRaw<Array<{ saleId: string }>>`SELECT d."saleId" FROM "FiscalDocument" d JOIN "FiscalNumberAllocation" a ON a."accountId"=d."accountId" AND a."documentId"=d.id WHERE d."accountId"=${actor.accountId} AND d."saleId" IS NOT NULL AND a."eNcf" LIKE ${prefix} ORDER BY a."eNcf" LIMIT 500`
  return rows.map(row => row.saleId)
}
