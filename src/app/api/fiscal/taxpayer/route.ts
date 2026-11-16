import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { hasPermission } from "@/lib/permissions"
import { resolveFiscalPolicy } from "@/lib/fiscal/core/policy"
import { normalizeDominicanBuyerId } from "@/lib/fiscal/core/sale-customer"
import { FiscalDocumentError } from "@/lib/fiscal/core/document"
import { actor, errorResponse, ok } from "../documents/_shared"

// Contrato reutilizable por web y móvil: GET ?identification=... devuelve { identification, legalName }.
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const user = await actor(request)
    if (!hasPermission(user, "canManageCustomers") && !(hasPermission(user, "canAccessSales") && hasPermission(user, "canPrepareFiscalDocuments"))) {
      throw new FiscalDocumentError("FORBIDDEN", "Sin permiso para consultar contribuyentes", 403)
    }
    const policy = await resolveFiscalPolicy(user.accountId)
    // La consulta tampoco queda accesible desde móvil cuando el módulo está apagado.
    if (!policy.enabled || policy.jurisdiction !== "DO" || policy.regime !== "DO_ECF") {
      throw new FiscalDocumentError("PROFILE_UNAVAILABLE", "La configuración fiscal dominicana no está activa", 409)
    }
    const values = request.nextUrl.searchParams.getAll("identification")
    const identification = normalizeDominicanBuyerId(values.length === 1 ? values[0] : null)
    const imported = await prisma.$queryRaw<Array<{ recordCount: number }>>`SELECT "recordCount" FROM "TaxpayerRegistryImport" WHERE id = 1`
    if (!imported.length) throw new FiscalDocumentError("REGISTRY_UNAVAILABLE", "El padrón de contribuyentes todavía no se ha importado", 503)
    const rows = await prisma.$queryRaw<Array<{ legalName: string }>>`SELECT "legalName" FROM "TaxpayerRegistry" WHERE identification = ${identification}`
    return ok({ identification, legalName: rows[0]?.legalName ?? null })
  } catch (error) { return errorResponse(error) }
}
