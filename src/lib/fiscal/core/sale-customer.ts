import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { FiscalDocumentError } from "./document"
import { parsePreferredReceiptTypes } from "./master-data"
import { resolveFiscalPolicy } from "./policy"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Db = Prisma.TransactionClient
type CustomerMatch = {
  id: string
  visualId: number
  name: string
  fiscalLegalName: string | null
  fiscalIdentification: string | null
  fiscalIdentificationType: string | null
  fiscalIdentificationCountry: string | null
  fiscalPreferredReceiptType: string | null
  cedula: string | null
  saleDiscountPercentBp: number
}

const salesReceipts = new Set(["E31", "E32", "E44", "E45", "E46"])

export function normalizeDominicanBuyerId(value: unknown): string {
  // No eliminar letras u otros símbolos: podrían convertir otra identidad en un RNC válido.
  if (typeof value !== "string" || value.length > 40 || !/^[\d\s-]+$/.test(value)) {
    throw new FiscalDocumentError("INVALID_INPUT", "Indica un RNC o cédula válido", 400, [{ field: "identification", message: "Usa 9 u 11 dígitos" }])
  }
  const normalized = value.replace(/[\s-]/g, "")
  if (!/^(?:\d{9}|\d{11})$/.test(normalized)) {
    throw new FiscalDocumentError("INVALID_INPUT", "Indica un RNC o cédula válido", 400, [{ field: "identification", message: "Usa 9 u 11 dígitos" }])
  }
  return normalized
}

export function preferredSaleReceipt(isGeneric: boolean, preference: string | null | undefined): string {
  if (isGeneric) return "E32"
  return parsePreferredReceiptTypes(preference).find(type => salesReceipts.has(type)) ?? "E32"
}

export async function requireFiscalSaleAccess(actor: Actor, db: Db = prisma) {
  if (!hasPermission(actor, "canAccessSales") || !hasPermission(actor, "canPrepareFiscalDocuments")) {
    throw new FiscalDocumentError("FORBIDDEN", "Sin permiso para preparar ventas fiscales", 403)
  }
  const policy = await resolveFiscalPolicy(actor.accountId, db)
  // El permiso por sí solo no habilita consultas fiscales cuando el módulo está apagado.
  if (!policy.enabled || policy.jurisdiction !== "DO" || policy.regime !== "DO_ECF" || policy.environment !== "TEST" || policy.configurationStatus !== "VALIDATED") {
    throw new FiscalDocumentError("PROFILE_UNAVAILABLE", "La configuración fiscal de prueba no está activa", 409)
  }
  return policy
}

export async function listFiscalSaleCustomers(actor: Actor, db: Db = prisma) {
  const policy = await requireFiscalSaleAccess(actor, db)
  const rows = await db.customer.findMany({ where: { accountId: actor.accountId, isActive: true }, orderBy: [{ isGeneric: "desc" }, { name: "asc" }, { id: "asc" }], take: 1000, select: { id: true, isGeneric: true, fiscalPreferredReceiptType: true } })
  return { policyVersion: policy.version, customers: rows.map(row => ({ id: row.id, preferredReceiptType: preferredSaleReceipt(row.isGeneric, row.fiscalPreferredReceiptType) })) }
}

export async function findSaleCustomerByIdentification(actor: Actor, input: unknown, db: Db = prisma) {
  await requireFiscalSaleAccess(actor, db)
  const identification = normalizeDominicanBuyerId(input)
  // Nunca resolver una identidad usando la ficha genérica o datos de otra empresa.
  // Cédula histórica solo es alternativa si no se guardó identificación fiscal.
  // Prisma llama visualId al campo, pero en PostgreSQL su nombre físico es id_visual.
  const rows = await db.$queryRaw<CustomerMatch[]>`
    SELECT id, "id_visual" AS "visualId", name, "fiscalLegalName", "fiscalIdentification",
      "fiscalIdentificationType", "fiscalIdentificationCountry", "fiscalPreferredReceiptType",
      cedula, "saleDiscountPercentBp"
    FROM "Customer"
    WHERE "accountId" = ${actor.accountId} AND "isActive" = true AND "isGeneric" = false
      AND (
        (NULLIF(BTRIM("fiscalIdentification"), '') IS NOT NULL
          AND ("fiscalIdentificationCountry" IS NULL OR "fiscalIdentificationCountry" = 'DO')
          AND "fiscalIdentification" ~ '^[0-9[:space:]-]+$'
          AND regexp_replace("fiscalIdentification", '[[:space:]-]', '', 'g') = ${identification})
        OR (NULLIF(BTRIM("fiscalIdentification"), '') IS NULL
          AND cedula ~ '^[0-9[:space:]-]+$'
          AND regexp_replace(cedula, '[[:space:]-]', '', 'g') = ${identification})
      )
    ORDER BY name, id LIMIT 21
  `
  return {
    matches: rows.slice(0, 20).map(row => ({
      id: row.id,
      visualId: row.visualId,
      name: row.name,
      legalName: row.fiscalLegalName,
      identification,
      identificationType: row.fiscalIdentificationType ?? (identification.length === 9 ? "RNC" : "CEDULA"),
      identificationCountry: "DO",
      preferredReceiptType: preferredSaleReceipt(false, row.fiscalPreferredReceiptType),
      saleDiscountPercentBp: row.saleDiscountPercentBp,
    })),
    hasMore: rows.length > 20,
  }
}

export async function resolveFiscalBuyerCustomer(actor: Actor, isGeneric: boolean, buyer: { identification: string; country: string } | undefined, db: Db = prisma) {
  if (!isGeneric || !buyer || buyer.country !== "DO") return null
  const result = await findSaleCustomerByIdentification(actor, buyer.identification, db)
  if (result.hasMore || result.matches.length > 1) throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "Selecciona el cliente con esa identificación", 422, [{ field: "fiscal.buyer.identification", message: "Hay varias fichas con ese RNC o cédula" }])
  return result.matches[0]?.id ?? null
}
