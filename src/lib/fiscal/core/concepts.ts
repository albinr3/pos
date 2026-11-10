import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { FiscalMasterDataError, fiscalFields, validateFiscalCatalogFields } from "./master-data"

type Actor = PermissionAwareUser & { id: string; accountId: string }
const fields = ["fiscalUnit", "fiscalTaxTreatment"] as const
export class FiscalConceptError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message) }
}
function authorize(actor: Actor) {
  if (!hasPermission(actor, "canEditProducts")) throw new FiscalConceptError("FORBIDDEN", "No tienes permiso para editar productos", 403)
}
export async function listConcepts(actor: Actor, page?: { take: number; cursor?: string }) {
  authorize(actor)
  // Un cursor solo puede apuntar a un concepto activo de la misma empresa.
  if (page?.cursor) await getConcept(actor, page.cursor)
  const items = await prisma.fiscalConcept.findMany({ where: { accountId: actor.accountId, isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], ...(page ? { take: page.take + 1, ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}) } : {}) })
  if (!page) return { items, nextCursor: null }
  const result = items.slice(0, page.take)
  return { items: result, nextCursor: items.length > page.take ? result[result.length - 1].id : null }
}
export async function getConcept(actor: Actor, id: string) {
  authorize(actor)
  const item = await prisma.fiscalConcept.findFirst({ where: { id, accountId: actor.accountId, isActive: true } })
  if (!item) throw new FiscalConceptError("NOT_FOUND", "Concepto no encontrado", 404)
  return item
}
export async function writeConcept(actor: Actor, input: unknown, id?: string) {
  authorize(actor)
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FiscalMasterDataError("Datos inválidos", "body")
  const body = input as Record<string, unknown>
  const unknown = Object.keys(body).filter(key => !["name", "kind", ...fields].includes(key))
  if (unknown.length) throw new FiscalMasterDataError("Campo no admitido", unknown[0])
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) throw new FiscalMasterDataError("Nombre inválido", "name")
  if (body.kind !== "SERVICIO" && body.kind !== "CARGO") throw new FiscalMasterDataError("Tipo de concepto inválido", "kind")
  const fiscal = fiscalFields(body, fields)
  const existing = id ? await getConcept(actor, id) : undefined
  validateFiscalCatalogFields(fiscal, existing)
  const data = { name: body.name.trim(), kind: body.kind, ...fiscal }
  if (!id) return prisma.fiscalConcept.create({ data: { ...data, accountId: actor.accountId } })
  // La escritura vuelve a comprobar la empresa, aun después de leer el concepto.
  const updated = await prisma.fiscalConcept.updateMany({ where: { id, accountId: actor.accountId, isActive: true }, data })
  if (!updated.count) throw new FiscalConceptError("NOT_FOUND", "Concepto no encontrado", 404)
  return getConcept(actor, id)
}
export async function removeConcept(actor: Actor, id: string) {
  authorize(actor)
  const updated = await prisma.fiscalConcept.updateMany({ where: { id, accountId: actor.accountId, isActive: true }, data: { isActive: false } })
  if (!updated.count) throw new FiscalConceptError("NOT_FOUND", "Concepto no encontrado", 404)
}
