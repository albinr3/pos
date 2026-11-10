import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { hasPermission } from "@/lib/permissions"
import { resolveFiscalPolicy } from "@/lib/fiscal/core/policy"
import { FISCAL_MASTER_CATALOG } from "@/lib/fiscal/core/master-data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  try {
    const user = await getCurrentUserFromRequest(request)
    if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "No autenticado", fields: [], retryable: false, correlationId } }, { status: 401 })
    const customers = hasPermission(user, "canManageCustomers")
    const suppliers = hasPermission(user, "canManageSuppliers")
    const products = hasPermission(user, "canEditProducts")
    if (!customers && !suppliers && !products) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Sin permiso para administrar datos maestros", fields: [], retryable: false, correlationId } }, { status: 403 })
    const policy = await resolveFiscalPolicy(user.accountId)
    // Un perfil de preparación DO permite consultar opciones, pero no acredita emisión.
    const isDO = policy.jurisdiction === "DO" && policy.regime === "DO_ECF"
    return NextResponse.json({ profile: isDO ? "DO_ECF" : null, catalogs: {
      ...((customers || suppliers) ? { countries: FISCAL_MASTER_CATALOG.countries, identificationTypes: FISCAL_MASTER_CATALOG.identificationTypes } : {}),
      ...(customers ? { receiptTypes: isDO ? FISCAL_MASTER_CATALOG.receiptTypes : [] } : {}),
      ...(suppliers ? { declaredConditions: FISCAL_MASTER_CATALOG.declaredConditions } : {}),
      ...(products ? { itemTypes: FISCAL_MASTER_CATALOG.itemTypes, taxTreatments: FISCAL_MASTER_CATALOG.taxTreatments } : {}),
    } }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("Error al consultar catálogos fiscales", correlationId, error)
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "No se pudieron consultar los catálogos", fields: [], retryable: true, correlationId } }, { status: 500 })
  }
}
