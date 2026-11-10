import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { hasPermission } from "@/lib/permissions"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"
import { PrintToolbar } from "@/components/app/print-toolbar"
import { DownloadReceiptPdfButton } from "@/components/app/download-receipt-pdf-button"

export const dynamic = "force-dynamic"

type Snapshot = {
  type: string; issueDate: string
  issuer: { name: string; identification: string }
  buyer: { name: string; identification: string; country: string } | null
  payment: { type: string; dueDate: string | null } | null
  lines: Array<{ description: string; quantity: string; unit: string; unitPrice: string; base: string; tax: string; gross: string }>
  totals: { tax: string; gross: string; additionalTaxes?: Array<{ code: string; amount: string }> }
  sale?: { invoiceCode?: string; payments?: Array<{ code: string; amountCents: number }>; special?: Record<string, unknown> | null }
}
const money = (value: string) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(Number(value))
const paymentLabels: Record<string, string> = { "1": "Efectivo", "2": "Transferencia", "3": "Tarjeta", "4": "Crédito", "8": "Otro" }
const specialLabels: Record<string, string> = { regime: "Régimen", exemptionReference: "Soporte de exención", governmentEntity: "Entidad gubernamental", purchaseOrder: "Orden de compra", purchaseOrderDate: "Fecha de orden", exportMode: "Modalidad", destinationCountry: "País de destino", shipmentNumber: "Embarque", containerNumber: "Contenedor", departurePort: "Puerto", deliveryTerms: "Entrega" }

export default async function FiscalSalePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string; autoprint?: string }> }) {
  const user = await getCurrentUser()
  if (!user || (!hasPermission(user, "canAccessSales") && !hasPermission(user, "canViewFiscalDocuments"))) return notFound()
  const { id } = await params
  const options = await searchParams
  const document = await prisma.fiscalDocument.findFirst({ where: { id, accountId: user.accountId, saleId: { not: null }, state: "PREPARADO_PENDIENTE_CONEXION" }, select: { snapshot: true } })
  if (!document) return notFound()
  const allocations = await prisma.$queryRaw<Array<{ eNcf: string }>>`SELECT "eNcf" FROM "FiscalNumberAllocation" WHERE "accountId"=${user.accountId} AND "documentId"=${id} LIMIT 1`
  if (!allocations[0]) return notFound()
  const snapshot = document.snapshot as unknown as Snapshot
  if (!snapshot?.issuer || !Array.isArray(snapshot.lines) || !snapshot.totals) return notFound()
  const thermal = options.format !== "CARTA"
  return <main className={`mx-auto bg-white p-4 text-black print-content ${thermal ? "w-[80mm] text-sm" : "max-w-[850px] text-base"}`}>
    <AutoPrintOnLoad enabled={options.autoprint === "1"} />
    <style dangerouslySetInnerHTML={{ __html: `@media print {.no-print {display:none!important} body{margin:0}} ${thermal ? "@page{size:80mm auto;margin:0}" : ""}` }} />
    <div className="no-print"><PrintToolbar secondaryLink={{ href: `/invoices/fiscal/${encodeURIComponent(id)}?format=${thermal ? "CARTA" : "80mm"}`, label: thermal ? "Ver carta" : "Ver ticket" }} />{thermal && <DownloadReceiptPdfButton filename={`documento-prueba-${allocations[0].eNcf}`} />}</div>
    <header className="border-b pb-3 text-center"><strong>{snapshot.issuer.name}</strong><p>RNC: {snapshot.issuer.identification}</p><h1 className="mt-2 font-bold">{snapshot.type} · {allocations[0].eNcf}</h1><p className="font-semibold">Documento de prueba / No emitido fiscalmente</p><p>Fecha: {snapshot.issueDate}</p>{snapshot.sale?.invoiceCode && <p>Factura interna: {snapshot.sale.invoiceCode}</p>}</header>
    {snapshot.buyer && <section className="border-b py-3"><p>Comprador: {snapshot.buyer.name}</p><p>Identificación: {snapshot.buyer.identification} · {snapshot.buyer.country}</p></section>}
    {snapshot.sale?.special && <section className="border-b py-3">{Object.entries(snapshot.sale.special).filter(([key, value]) => specialLabels[key] && value !== null && value !== undefined && value !== "").map(([key, value]) => <p key={key}>{specialLabels[key]}: {value === true ? "Sí" : String(value)}</p>)}</section>}
    <section className="border-b py-3"><table className="w-full text-left"><thead><tr><th>Detalle</th><th className="text-right">Total</th></tr></thead><tbody>{snapshot.lines.map((line, index) => <tr key={index}><td className="py-1">{line.description}<br /><span className="text-xs">{line.quantity} {line.unit} × {money(line.unitPrice)}</span></td><td className="text-right">{money(line.gross)}</td></tr>)}</tbody></table></section>
    <section className="grid gap-1 py-3"><p>ITBIS: {money(snapshot.totals.tax)}</p>{snapshot.totals.additionalTaxes?.map((tax, index) => <p key={`${tax.code}-${index}`}>Propina legal: {money(tax.amount)}</p>)}<p className="text-lg font-bold">Total: {money(snapshot.totals.gross)}</p>{snapshot.payment && <p>{snapshot.payment.type === "CREDITO" ? "Crédito" : "Contado"}{snapshot.payment.dueDate ? ` · Vence ${snapshot.payment.dueDate}` : ""}</p>}{snapshot.sale?.payments?.map((payment, index) => <p key={index}>{paymentLabels[payment.code] ?? "Pago"}: {money((payment.amountCents / 100).toFixed(2))}</p>)}</section>
  </main>
}
