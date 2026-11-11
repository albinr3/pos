import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { FiscalDocumentError } from "./document"

type Actor = PermissionAwareUser & { id: string; accountId: string }
export type PrintableSnapshot = {
  type: string; issueDate: string
  issuer: { name: string; identification: string }
  buyer: { name: string; identification: string; country: string } | null
  supplier: { name: string; identification: string; country: string; residence?: string | null } | null
  currency: { operation: string; reporting: string; rate: string; rateDate: string | null }
  payment: { type: string; dueDate: string | null } | null
  lines: Array<{ description: string; quantity: string; unit: string; unitPrice: string; base: string; tax: string; gross: string; taxTreatment: string; withholdings: Array<{kind: string; amount: string}> }>
  totals: { bases: Record<string,string>; tax: string; gross: string; withheld?: string; withheldByKind?: Record<string,string>; net?: string; taxNotCreditable?: string; additionalTaxes?: Array<{ code: string; amount: string }> }
  reportingTotals?: { gross: string; withheld: string; net: string }
  reference?: { documentId: string; issueDate: string; modificationCode: string; creditIndicator: number | null } | null
  adjustment?: { reason?: string }
  sale?: { invoiceCode?: string; payments?: Array<{ code: string; amountCents: number }>; special?: Record<string, unknown> | null }
}

export async function getFiscalPrintable(actor: Actor, id: string) {
  const document = await prisma.fiscalDocument.findFirst({ where: { id, accountId: actor.accountId, state: "PREPARADO_PENDIENTE_CONEXION" }, select: { snapshot: true, saleId: true, adjustmentId: true, adjustmentSource: { select: { actorUserId: true } } } })
  if (!document) throw new FiscalDocumentError("NOT_FOUND", "Documento no encontrado", 404)
  const view = hasPermission(actor, "canViewFiscalDocuments")
  // La excepción histórica permite al preparador imprimir su propia nota, no las ajenas.
  const ownNote = Boolean(document.adjustmentId && hasPermission(actor, "canPrepareFiscalDocuments") && document.adjustmentSource?.actorUserId === actor.id)
  const sale = Boolean(document.saleId && !document.adjustmentId && hasPermission(actor, "canAccessSales"))
  if (!view && !ownNote && !sale) throw new FiscalDocumentError("FORBIDDEN", "Sin permiso para consultar el documento", 403)
  const allocation = await prisma.fiscalNumberAllocation.findFirst({ where: { accountId: actor.accountId, documentId: id }, select: { eNcf: true, environment: true } })
  const snapshot = document.snapshot as unknown as PrintableSnapshot
  if (!allocation || !snapshot?.issuer || !Array.isArray(snapshot.lines) || !snapshot.totals || !snapshot.currency?.operation) throw new FiscalDocumentError("DOCUMENT_CONFLICT", "La copia conservada no permite imprimir este documento", 409)
  const reference = snapshot.reference ? await prisma.fiscalNumberAllocation.findFirst({ where: { accountId: actor.accountId, documentId: snapshot.reference.documentId }, select: { eNcf: true } }) : null
  return { id, state: "PREPARADO_PENDIENTE_CONEXION" as const, notice: "Documento de prueba / No emitido fiscalmente", number: allocation.eNcf, environment: allocation.environment, referenceNumber: reference?.eNcf ?? null, snapshot, official: null, saleId: document.saleId }
}

export type FiscalPrintable = Awaited<ReturnType<typeof getFiscalPrintable>>

// Ambas salidas usan exclusivamente la misma copia, sin consultar productos o ajustes actuales.
export function printableText(doc: FiscalPrintable): string[] {
  const s = doc.snapshot, currency = s.currency.operation
  const amount = (value: string | undefined) => `${currency} ${value ?? "0.00"}`
  const lines = [s.issuer.name, `RNC: ${s.issuer.identification}`, `${s.type} - ${doc.number}`, doc.notice, `Fecha: ${s.issueDate}`]
  if (s.sale?.invoiceCode) lines.push(`Factura interna: ${s.sale.invoiceCode}`)
  for (const [label, party] of [["Comprador", s.buyer], ["Proveedor", s.supplier]] as const) if (party) lines.push(`${label}: ${party.name}`, `Identificación: ${party.identification} - ${party.country}`)
  if (s.reference) lines.push(`Comprobante original: ${doc.referenceNumber ?? s.reference.documentId}`, `Fecha original: ${s.reference.issueDate} - Modificación: ${s.reference.modificationCode}`, ...(s.reference.creditIndicator === null ? [] : [`Indicador de crédito: ${s.reference.creditIndicator}`]), ...(s.adjustment?.reason ? [`Motivo: ${s.adjustment.reason}`] : []))
  const labels: Record<string,string> = { regime: "Régimen", exemptionReference: "Soporte de exención", governmentEntity: "Entidad gubernamental", purchaseOrder: "Orden de compra", purchaseOrderDate: "Fecha de orden", exportMode: "Modalidad", destinationCountry: "País de destino", shipmentNumber: "Embarque", containerNumber: "Contenedor", departurePort: "Puerto", deliveryTerms: "Entrega" }
  if (s.sale?.special) for (const [key, value] of Object.entries(s.sale.special)) if (labels[key] && value !== null && value !== undefined && value !== "") lines.push(`${labels[key]}: ${value === true ? "Sí" : String(value)}`)
  if (currency !== "DOP") lines.push(`Moneda: ${currency} - Tasa DOP: ${s.currency.rate} - Fecha: ${s.currency.rateDate ?? "—"}`)
  lines.push("DETALLE")
  for (const line of s.lines) {
    lines.push(line.description, `${line.quantity} ${line.unit} x ${amount(line.unitPrice)} = ${amount(line.gross)}`, `Base ${amount(line.base)} - ITBIS ${amount(line.tax)} - ${line.taxTreatment}`)
    for (const withholding of line.withholdings ?? []) lines.push(`Retención ${withholding.kind}: ${amount(withholding.amount)}`)
  }
  lines.push(`ITBIS: ${amount(s.totals.tax)}`)
  for (const tax of s.totals.additionalTaxes ?? []) lines.push(`Impuesto adicional ${tax.code}: ${amount(tax.amount)}`)
  lines.push(`Total documentado: ${amount(s.totals.gross)}`)
  if (s.totals.withheldByKind) for (const [kind, value] of Object.entries(s.totals.withheldByKind)) lines.push(`Retención ${kind}: ${amount(value)}`)
  if (["E34", "E41", "E47"].includes(s.type)) lines.push(`Importe económico aplicable: ${amount(s.totals.net)}`)
  if (s.type === "E34") lines.push(`ITBIS no acreditable: ${amount(s.totals.taxNotCreditable)}`)
  if (currency !== "DOP" && s.reportingTotals) lines.push(`Equivalente DOP: ${s.reportingTotals.gross}`, `Neto DOP: ${s.reportingTotals.net}`)
  if (s.payment) lines.push(`Pago: ${s.payment.type}${s.payment.dueDate ? ` - Vence ${s.payment.dueDate}` : ""}`)
  const paymentLabels: Record<string,string> = { "1": "Efectivo", "2": "Transferencia", "3": "Tarjeta", "4": "Crédito", "8": "Otro" }
  for (const payment of s.sale?.payments ?? []) lines.push(`${paymentLabels[payment.code] ?? "Pago"}: DOP ${(payment.amountCents / 100).toFixed(2)}`)
  return lines
}
