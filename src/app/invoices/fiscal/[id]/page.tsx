import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { hasPermission } from "@/lib/permissions"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"
import { PrintToolbar } from "@/components/app/print-toolbar"
import { DownloadReceiptPdfButton } from "@/components/app/download-receipt-pdf-button"
import Link from "next/link"

export const dynamic = "force-dynamic"

type Snapshot = {
  type: string; issueDate: string
  issuer: { name: string; identification: string }
  buyer: { name: string; identification: string; country: string } | null
  payment: { type: string; dueDate: string | null } | null
  lines: Array<{ description: string; quantity: string; unit: string; unitPrice: string; base: string; tax: string; gross: string }>
  totals: { tax: string; gross: string; net?: string; taxNotCreditable?: string; additionalTaxes?: Array<{ code: string; amount: string }> }
  reference?: { documentId: string; issueDate: string; modificationCode: string; creditIndicator: number | null } | null
  adjustment?: { reason?: string }
  sale?: { invoiceCode?: string; payments?: Array<{ code: string; amountCents: number }>; special?: Record<string, unknown> | null }
}
const money = (value: string) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(Number(value))
const paymentLabels: Record<string, string> = { "1": "Efectivo", "2": "Transferencia", "3": "Tarjeta", "4": "Crédito", "8": "Otro" }
const specialLabels: Record<string, string> = { regime: "Régimen", exemptionReference: "Soporte de exención", governmentEntity: "Entidad gubernamental", purchaseOrder: "Orden de compra", purchaseOrderDate: "Fecha de orden", exportMode: "Modalidad", destinationCountry: "País de destino", shipmentNumber: "Embarque", containerNumber: "Contenedor", departurePort: "Puerto", deliveryTerms: "Entrega" }

export default async function FiscalSalePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string; autoprint?: string }> }) {
  const user = await getCurrentUser()
  if (!user || (!hasPermission(user, "canAccessSales") && !hasPermission(user, "canViewFiscalDocuments") && !hasPermission(user, "canPrepareFiscalDocuments"))) return notFound()
  const { id } = await params
  const options = await searchParams
  const document = await prisma.fiscalDocument.findFirst({ where: { id, accountId: user.accountId, state: "PREPARADO_PENDIENTE_CONEXION", OR: [{ saleId: { not: null } }, { adjustmentId: { not: null } }] }, select: { snapshot: true, saleId: true, adjustmentId: true, adjustmentSource: { select: { actorUserId: true } } } })
  if (!document) return notFound()
  // Preparar permite imprimir la nota propia; consultar las ajenas exige acceso fiscal de lectura.
  if (document.adjustmentId && !hasPermission(user, "canViewFiscalDocuments") && !(hasPermission(user, "canPrepareFiscalDocuments") && document.adjustmentSource?.actorUserId === user.id)) return notFound()
  if (!document.adjustmentId && !hasPermission(user, "canAccessSales") && !hasPermission(user, "canViewFiscalDocuments")) return notFound()
  const allocations = await prisma.$queryRaw<Array<{ eNcf: string }>>`SELECT "eNcf" FROM "FiscalNumberAllocation" WHERE "accountId"=${user.accountId} AND "documentId"=${id} LIMIT 1`
  if (!allocations[0]) return notFound()
  const snapshot = document.snapshot as unknown as Snapshot
  if (!snapshot?.issuer || !Array.isArray(snapshot.lines) || !snapshot.totals) return notFound()
  const referenceNumbers = snapshot.reference ? await prisma.$queryRaw<Array<{ eNcf: string }>>`SELECT "eNcf" FROM "FiscalNumberAllocation" WHERE "accountId"=${user.accountId} AND "documentId"=${snapshot.reference.documentId} LIMIT 1` : []
  const settings = document.saleId && hasPermission(user, "canPrepareFiscalDocuments") ? await prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId }, select: { enabled: true, configurationStatus: true, regime: true, environment: true, jurisdiction: true } }) : null
  const canPrepareNotes = Boolean(settings?.enabled && settings.configurationStatus === "VALIDATED" && settings.jurisdiction === "DO" && settings.regime === "DO_ECF" && settings.environment === "TEST" && ["E31", "E32", "E44", "E45", "E46"].includes(snapshot.type))
  const thermal = options.format !== "CARTA"
  return <main className={`mx-auto bg-white p-4 text-black print-content ${thermal ? "w-[80mm] text-sm" : "max-w-[850px] text-base"}`}>
    <AutoPrintOnLoad enabled={options.autoprint === "1"} />
    <style dangerouslySetInnerHTML={{ __html: `@media print {.no-print {display:none!important} body{margin:0}} ${thermal ? "@page{size:80mm auto;margin:0}" : ""}` }} />
    <div className="no-print"><PrintToolbar secondaryLink={{ href: `/invoices/fiscal/${encodeURIComponent(id)}?format=${thermal ? "CARTA" : "80mm"}`, label: thermal ? "Ver carta" : "Ver ticket" }} />{thermal && <DownloadReceiptPdfButton filename={`documento-prueba-${allocations[0].eNcf}`} />}{canPrepareNotes && <div className="flex flex-wrap gap-3 py-2">{hasPermission(user, "canAccessReturns") && <Link className="rounded border px-3 py-2" href={`/fiscal/credit-notes?originalDocumentId=${encodeURIComponent(id)}`}>Crear nota de crédito</Link>}{hasPermission(user, "canAccessSales") && hasPermission(user, "canAccessAccountsReceivable") && <Link className="rounded border px-3 py-2" href={`/fiscal/debit-notes?originalDocumentId=${encodeURIComponent(id)}`}>Crear nota de débito</Link>}</div>}</div>
    <header className="border-b pb-3 text-center"><strong>{snapshot.issuer.name}</strong><p>RNC: {snapshot.issuer.identification}</p><h1 className="mt-2 font-bold">{snapshot.type} · {allocations[0].eNcf}</h1><p className="font-semibold">Documento de prueba / No emitido fiscalmente</p><p>Fecha: {snapshot.issueDate}</p>{snapshot.sale?.invoiceCode && <p>Factura interna: {snapshot.sale.invoiceCode}</p>}</header>
    {snapshot.buyer && <section className="border-b py-3"><p>Comprador: {snapshot.buyer.name}</p><p>Identificación: {snapshot.buyer.identification} · {snapshot.buyer.country}</p></section>}
    {snapshot.reference && <section className="border-b py-3"><p>Comprobante original: {referenceNumbers[0]?.eNcf ?? snapshot.reference.documentId}</p><p>Fecha original: {snapshot.reference.issueDate} · Modificación: {snapshot.reference.modificationCode}</p>{snapshot.reference.creditIndicator !== null && <p>Indicador de crédito: {snapshot.reference.creditIndicator}</p>}{snapshot.adjustment?.reason && <p>Motivo: {snapshot.adjustment.reason}</p>}</section>}
    {snapshot.sale?.special && <section className="border-b py-3">{Object.entries(snapshot.sale.special).filter(([key, value]) => specialLabels[key] && value !== null && value !== undefined && value !== "").map(([key, value]) => <p key={key}>{specialLabels[key]}: {value === true ? "Sí" : String(value)}</p>)}</section>}
    <section className="border-b py-3"><table className="w-full text-left"><thead><tr><th>Detalle</th><th className="text-right">Total</th></tr></thead><tbody>{snapshot.lines.map((line, index) => <tr key={index}><td className="py-1">{line.description}<br /><span className="text-xs">{line.quantity} {line.unit} × {money(line.unitPrice)}</span></td><td className="text-right">{money(line.gross)}</td></tr>)}</tbody></table></section>
    <section className="grid gap-1 py-3"><p>ITBIS: {money(snapshot.totals.tax)}</p>{snapshot.totals.additionalTaxes?.map((tax, index) => <p key={`${tax.code}-${index}`}>Propina legal: {money(tax.amount)}</p>)}<p className="text-lg font-bold">Total documentado: {money(snapshot.totals.gross)}</p>{snapshot.type === "E34" && <><p>ITBIS no acreditable: {money(snapshot.totals.taxNotCreditable ?? "0")}</p><p>Importe económico aplicable: {money(snapshot.totals.net ?? "0")}</p></>}{snapshot.payment && <p>{snapshot.payment.type === "CREDITO" ? "Crédito" : "Contado"}{snapshot.payment.dueDate ? ` · Vence ${snapshot.payment.dueDate}` : ""}</p>}{snapshot.sale?.payments?.map((payment, index) => <p key={index}>{paymentLabels[payment.code] ?? "Pago"}: {money((payment.amountCents / 100).toFixed(2))}</p>)}</section>
  </main>
}
