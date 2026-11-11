import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { resolveFiscalPolicy } from "./policy"
import type { Prisma } from "@prisma/client"
import { calculateFiscalDocument, FiscalDocumentError } from "./document"
import { Decimal } from "@prisma/client/runtime/library"

type Actor = PermissionAwareUser & { id: string; accountId: string }
export async function previewFiscalDocument(actor: Actor, input: unknown, db: Prisma.TransactionClient = prisma, reconciledLineLimits?: ReadonlyMap<number, number>) {
  if (!hasPermission(actor, "canPrepareFiscalDocuments")) throw new FiscalDocumentError("FORBIDDEN", "Sin permiso para preparar documentos fiscales", 403)
  const policy = await resolveFiscalPolicy(actor.accountId, db)
  if (policy.jurisdiction !== "DO" || policy.regime !== "DO_ECF") throw new FiscalDocumentError("PROFILE_UNAVAILABLE", "Configura el perfil DO_ECF para previsualizar", 409)
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const expected = (input as Record<string, unknown>).expectedPolicyVersion
    if (expected !== undefined && (!Number.isSafeInteger(expected) || expected !== policy.version)) throw new FiscalDocumentError("VERSION_CONFLICT", "La política fiscal cambió; vuelve a cargarla", 409, [{ field: "expectedPolicyVersion", message: "Versión desactualizada" }])
  }
  const result = calculateFiscalDocument(input, policy.version ?? 0)
  if (result.type === "E41" && (!hasPermission(actor,"canManagePurchases") || (result.source?.kind === "PAYABLE" && !hasPermission(actor,"canAccessAccountsPayable")))) throw new FiscalDocumentError("FORBIDDEN", "Sin permiso para consultar el origen de la compra", 403)
  if (result.type === "E43" && !hasPermission(actor,"canManageExpenses")) throw new FiscalDocumentError("FORBIDDEN", "Sin permiso para consultar el gasto", 403)
  if (result.type === "E47" && !hasPermission(actor,"canAccessAccountsPayable")) throw new FiscalDocumentError("FORBIDDEN", "Sin permiso para consultar el pago", 403)
  const accountId = actor.accountId
  const missing = () => new FiscalDocumentError("NOT_FOUND", "La referencia no existe o no pertenece a la empresa", 404)
  const settings = await db.fiscalSettings.findUnique({ where: { accountId }, select: { legalName: true, taxId: true } })
  // El formato visual con guiones no cambia el RNC; no retirar letras para inventar otra identidad.
  const configuredTaxId = settings?.taxId && /^[\d\s-]+$/.test(settings.taxId) ? settings.taxId.replace(/[\s-]/g, "") : settings?.taxId
  if ((settings?.legalName && settings.legalName !== result.issuer.name) || (configuredTaxId && configuredTaxId !== result.issuer.identification)) throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "El emisor debe coincidir con la configuración de la empresa", 422, [{ field: "issuer", message: "Los datos no coinciden con la empresa" }])
  if (result.issuer.id && result.issuer.id !== accountId) throw missing()
  if (result.buyer?.id && !await db.customer.findFirst({ where: { id: result.buyer.id, accountId }, select: { id: true } })) throw missing()
  if (result.supplier?.id && !await db.supplier.findFirst({ where: { id: result.supplier.id, accountId }, select: { id: true } })) throw missing()
  const productIds = [...new Set(result.lines.flatMap(l => l.productId ? [l.productId] : []))]
  const conceptIds = [...new Set(result.lines.flatMap(l => l.conceptId ? [l.conceptId] : []))]
  if (productIds.length && await db.product.count({ where: { accountId, id: { in: productIds } } }) !== productIds.length) throw missing()
  if (conceptIds.length && await db.fiscalConcept.count({ where: { accountId, id: { in: conceptIds } } }) !== conceptIds.length) throw missing()
  if (result.source) {
    const where = { id: result.source.id, accountId }
    const found = result.source.kind === "SALE" ? await db.sale.findFirst({ where, select: { id: true } }) : result.source.kind === "PURCHASE" ? await db.purchase.findFirst({ where, select: { id: true } }) : result.source.kind === "PAYABLE" ? await db.accountPayable.findFirst({ where: { ...where, purchaseId: null }, select: { id: true } }) : result.source.kind === "RETURN" ? await db.return.findFirst({ where, select: { id: true } }) : result.source.kind === "SUPPLIER_PAYMENT" ? await db.supplierPayment.findFirst({ where, select: { id: true } }) : await db.operatingExpense.findFirst({ where, select: { id: true } })
    if (!found) throw missing()
  }
  if (result.reference) {
    // La fecha y el comprador de una nota proceden de la copia, nunca del cliente móvil.
    const rows = await db.$queryRaw<Array<{ snapshot: unknown; state: string; type: string }>>`SELECT "snapshot", "state", "type" FROM "FiscalDocument" WHERE "id" = ${result.reference.documentId} AND "accountId" = ${accountId}`
    if (!rows.length) throw missing()
    const snapshot = rows[0].snapshot as { issueDate?: string; buyer?: { name?: string; identification?: string; country?: string } | null; supplier?: { name?: string; identification?: string; country?: string } | null; currency?: { operation?: string }; totals?: { gross?: string }; reportingTotals?: { gross?: string }; lines?: Array<Record<string, unknown>> } | null
    const originalParty = snapshot?.buyer ?? snapshot?.supplier ?? null
    const noteParty = result.buyer ?? result.supplier ?? null
    // Una nota nunca puede modificar otra nota ni cambiar la identidad o el país de la contraparte original.
    if (rows[0].state !== "PREPARADO_PENDIENTE_CONEXION" || ["E33", "E34"].includes(rows[0].type) || snapshot?.issueDate !== result.reference.issueDate || originalParty?.identification !== noteParty?.identification || originalParty?.country !== noteParty?.country) throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "La referencia no coincide con el documento conservado", 422, [{ field: "reference", message: "Referencia no elegible o datos distintos" }])
    if (rows[0].type === "E32") {
      // El umbral corresponde al total original en DOP, no al monto menor de la nota ni a la tasa enviada por el cliente.
      const operation = snapshot?.currency?.operation
      const grossDop = operation === "DOP" ? snapshot?.totals?.gross : operation ? snapshot?.reportingTotals?.gross : undefined
      if (typeof grossDop !== "string" || grossDop.length > 32 || !/^\d+(?:\.\d{1,2})?$/.test(grossDop)) throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "La copia de consumo no permite comprobar el umbral en DOP", 422, [{ field: "reference", message: "Falta el total original de reporte" }])
      if (new Decimal(grossDop).gte(250000) && (!result.buyer || typeof snapshot?.buyer?.name !== "string" || !snapshot.buyer.name.trim() || !snapshot.buyer.identification || !snapshot.buyer.country)) throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "La nota requiere identificar al comprador de la factura de consumo", 422, [{ field: "buyer", message: "Falta el comprador en la nota o en la copia original" }])
    }
    if (result.type === "E34") {
      // El límite procede de la copia original, nunca de un total enviado por el cliente.
      const originalGross = snapshot?.totals?.gross
      if (snapshot?.currency?.operation !== result.currency.operation || typeof originalGross !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(originalGross)) throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "La copia referenciada no permite verificar moneda e importe", 422, [{ field: "reference", message: "Faltan moneda o importe original comprobable" }])
      if (new Decimal(result.totals.gross).gt(new Decimal(originalGross))) throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "La nota supera el importe del comprobante original", 422, [{ field: "lines", message: "El total no puede superar el documento referenciado" }])
      if (result.reference.modificationCode !== "2") {
        const used = new Set<number>()
        const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP })
        const validDecimal = (v: unknown): v is string => typeof v === "string" && v.length <= 32 && /^\d+(?:\.\d{1,4})?$/.test(v)
        result.lines.forEach((line, index) => {
          const fail = (message: string): never => { throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "La línea no coincide con la copia original", 422, [{ field: `lines.${index}.originalLine`, message }]) }
          const number = line.originalLine
          if (number === undefined || used.has(number)) return fail("Indica una línea original distinta para cada línea de la nota")
          used.add(number)
          const original = Array.isArray(snapshot?.lines) ? snapshot.lines[number - 1] : undefined
          if (!original || typeof original !== "object" || !validDecimal(original.quantity) || !validDecimal(original.unitPrice) || !validDecimal(original.gross) || new D(original.quantity).lte(0)) return fail("La copia original no contiene una línea comprobable")
          // Una nota fuera de plazo no puede transformar ITBIS original en importe exento recuperable.
          if (original.kind !== line.kind || original.unit !== line.unit || original.taxTreatment !== line.taxTreatment || original.priceIncludesTax !== line.priceIncludesTax || (original.productId ?? null) !== (line.productId ?? null) || (original.conceptId ?? null) !== (line.conceptId ?? null) || (!line.productId && !line.conceptId && original.description !== line.description) || !new D(original.unitPrice).eq(line.unitPrice)) return fail("Conserva concepto, unidad, precio y tratamiento fiscal originales")
          const quantity = new D(line.quantity)
          const limit = new D(original.gross).mul(quantity).div(original.quantity).toDecimalPlaces(2, D.ROUND_HALF_UP)
          // Solo el servicio de devoluciones aporta límites conciliados; la API genérica conserva el límite proporcional.
          const reconciledLimit = reconciledLineLimits?.get(number)
          const effectiveLimit = reconciledLimit === undefined ? limit : new D(reconciledLimit).div(100)
          if (quantity.gt(original.quantity) || new D(line.gross).gt(effectiveLimit)) return fail("La cantidad o el importe proporcional supera la línea original")
        })
      }
    }
  }
  return result
}
