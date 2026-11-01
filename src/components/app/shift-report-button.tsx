"use client"

import { useState } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { loadCashShiftReport, type CashActorIdentity, type CashContext } from "@/lib/cash-offline"
import { formatRD } from "@/lib/money"
import { formatDateTimeDO } from "@/lib/date-time"
import { getPaymentMethodLabel } from "@/lib/payment-methods"

type Report = Awaited<ReturnType<typeof loadCashShiftReport>>
const kindLabels: Record<string, string> = { sale: "Venta", payment: "Abono", batchPayment: "Abono múltiple", purchase: "Compra", ocrPurchase: "Compra", operatingExpense: "Gasto", expense: "Gasto", return: "Devolución", treasuryTransfer: "Traspaso entre cuentas", transfer: "Traspaso entre cuentas", OWNER_IN: "Aporte del dueño", OWNER_OUT: "Retiro del dueño", OPENING_DIFFERENCE: "Diferencia al abrir", CLOSING_DIFFERENCE: "Diferencia al cerrar", manual: "Movimiento de caja" }
const movementName = (type: string) => kindLabels[type] ?? "Movimiento"

export function ShiftReport({ report }: { report: Report }) {
  const { snapshot, context, local, provisional } = report
  const movements = snapshot?.movements ?? []
  const methods = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO", "SIN_METODO"]
  const methodOf = (method: string | null) => method === null ? "SIN_METODO" : methods.includes(method) ? method : "OTRO"
  return <main className="report">
    <header><div className="eyebrow">CUADRE DE CAJA · DETALLE DEL TURNO</div><h1>{snapshot?.companyName ?? "Detalle del turno"}</h1><div className="metadata"><span><b>Cajero:</b> {snapshot?.cashierName ?? context.activeShift?.cashierName}</span><span><b>Apertura:</b> {formatDateTimeDO(snapshot?.openedAt ?? context.activeShift!.openedAt)}</span><span><b>Impreso:</b> {formatDateTimeDO(report.generatedAt)}</span></div></header>
    {provisional && <div className="warning"><strong>REPORTE PROVISIONAL O INCOMPLETO</strong><p>{snapshot ? `Última actualización del servidor: ${formatDateTimeDO(snapshot.generatedAt)}.` : "No hay una copia previa del detalle confirmado en este dispositivo."} Puede haber operaciones aún no reflejadas. Este documento no confirma el cierre.</p></div>}
    {snapshot && <section className="cash-summary"><div className="summary-heading"><div><div className="eyebrow">1 · CUENTA EL EFECTIVO</div><h2>Efectivo esperado en caja</h2><p>Compara este importe con el dinero físico que tienes en caja.</p></div><strong className="expected">{formatRD(snapshot.expectedCashCents)}</strong></div><div className="summary-breakdown"><div className="line"><span>Fondo recibido al abrir</span><strong>{formatRD(snapshot.openingCents)}</strong></div><div className="line"><span>Variación neta durante el turno</span><strong>{formatRD(snapshot.expectedCashCents - snapshot.openingCents)}</strong></div></div><p className="muted">Calculado con la información disponible al {formatDateTimeDO(snapshot.generatedAt)}. No es el efectivo contado ni confirma el cierre.</p></section>}
    {snapshot && <section><div className="eyebrow">2 · REVISA LOS MOVIMIENTOS</div><h2>Detalle por método de pago</h2><p className="section-intro">Consulta los cobros y salidas registrados durante el turno.</p>{methods.map(method => {
      const rows = movements.filter(m => methodOf(m.method) === method)
      if (!rows.length && !["EFECTIVO", "TARJETA", "TRANSFERENCIA"].includes(method)) return null
      const collections = rows.filter(m => m.sourceType === "sale" || m.sourceType === "payment").reduce((sum, m) => sum + m.amountCents, 0)
      const other = rows.filter(m => ["purchase", "operatingExpense", "return"].includes(m.sourceType)).reduce((sum, m) => sum + m.amountCents, 0)
      return <div className="group" key={method}><div className="group-heading"><h3>{method === "SIN_METODO" ? "Tesorería y movimientos sin método" : getPaymentMethodLabel(method)}</h3><span>{rows.length} {rows.length === 1 ? "movimiento" : "movimientos"}</span></div>
        {method !== "SIN_METODO" && <div className="totals"><span>Cobros netos <strong>{formatRD(collections)}</strong></span><span>Gastos, compras y devoluciones <strong>{formatRD(other)}</strong></span></div>}
        {rows.length === 0 ? <p className="muted">Sin movimientos</p> : rows.map(row => <div className="movement" key={row.id}><div><strong>{movementName(row.sourceType)}</strong> · {row.reference}</div><div className="line"><span>{formatDateTimeDO(row.recordedAt)} · {row.treasuryAccount.name}</span><strong>{formatRD(row.amountCents)}</strong></div>{row.note && <div className="muted">{row.note}</div>}</div>)}
      </div>
    })}</section>}
    {snapshot && snapshot.documents.length > 0 && <section><h2>Operaciones sin movimiento de dinero</h2><p className="section-intro">Estas operaciones no se suman al efectivo esperado.</p>{snapshot.documents.map(row => <div className="line movement" key={`${row.sourceType}:${row.id}`}><span>{movementName(row.sourceType)} · {row.reference}{row.cancelled ? " · Anulada" : ""} {row.recordedAt && <>· {formatDateTimeDO(row.recordedAt)}</>}</span><strong>{formatRD(row.amountCents)}</strong></div>)}</section>}
    {local.length > 0 && <section className="pending"><h2>Operaciones locales por verificar</h2><p>Se muestran por separado y no se suman a los importes confirmados.</p>{local.map(row => {
      const method = row.payload.method ?? row.payload.paymentMethod
      const splits = Array.isArray(row.payload.paymentSplits) ? row.payload.paymentSplits as Array<{ method?: string; amountCents?: number }> : []
      const amount = row.amountCents ?? (typeof row.payload.amountCents === "number" ? row.payload.amountCents : undefined)
      return <div className="movement" key={row.id}><div><strong>{movementName(row.kind)}</strong> · {row.reference ?? row.id}</div><div>{row.status === "confirmed" ? "Confirmada; aún no incorporada a la copia" : "Pendiente o por confirmar"}{row.error ? ` · ${row.error}` : ""}{row.recordedAt && <> · {formatDateTimeDO(row.recordedAt)}</>}</div>{typeof method === "string" && <div>{getPaymentMethodLabel(method)}</div>}{typeof amount === "number" && <div>Importe indicado: {formatRD(amount)}</div>}{splits.map((split, index) => <div key={index}>{getPaymentMethodLabel(split.method ?? "OTRO")}{typeof split.amountCents === "number" ? ` · ${formatRD(split.amountCents)}` : ""}</div>)}</div>
    })}</section>}
    <footer>Detalle informativo del turno. Los traspasos se muestran en sus cuentas de origen y destino.</footer>
  </main>
}

export function reportStyles(format: "CARTA" | "80mm") {
  const thermal = format === "80mm"
  // CARTA debe usar tamaño carta real para evitar una paginación inesperada al imprimir.
  return `@page { size: ${thermal ? "80mm auto" : "letter"}; margin: ${thermal ? "3mm" : "12mm"}; }
    * { box-sizing:border-box } body { margin:0; color:#18212b; background:#fff; font:${thermal ? "11px" : "13px"} Arial,sans-serif; line-height:1.35; print-color-adjust:exact; -webkit-print-color-adjust:exact }
    .report { width:${thermal ? "74mm" : "100%"}; margin:auto; overflow-wrap:anywhere } header { border-bottom:2px solid #18212b; padding-bottom:10px }
    .eyebrow { font-size:.78em; font-weight:bold; letter-spacing:.09em; color:#526070 } h1 { font-size:1.5em; margin:3px 0 6px } h2 { font-size:1.18em; margin:2px 0 5px } h3 { font-size:1.05em; margin:0 } p { margin:4px 0 }
    .metadata { display:flex; flex-wrap:wrap; gap:2px 18px; color:#46515d; font-size:.9em } section { margin-top:18px } .warning, .pending { border:2px solid #222; padding:9px; margin-top:12px } .warning p { margin-bottom:0 }
    .cash-summary { border:2px solid #18212b; padding:12px; break-inside:avoid } .summary-heading { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap } .summary-heading p { color:#46515d } .expected { font-size:1.8em; white-space:nowrap } .summary-breakdown { border-top:1px solid #aab2ba; margin-top:9px; padding-top:6px } .summary-breakdown .line { padding:2px 0 }
    .line { display:flex; justify-content:space-between; align-items:baseline; gap:8px } .line strong { white-space:nowrap } .section-intro { color:#526070; margin-bottom:8px } .group { margin-top:12px; break-inside:auto } .group-heading { display:flex; justify-content:space-between; align-items:baseline; gap:8px; border-bottom:1px solid #18212b; padding-bottom:4px; break-after:avoid } .group-heading span { color:#526070; font-size:.85em; white-space:nowrap }
    .movement { border-bottom:1px solid #d5d9dd; padding:7px 0; break-inside:avoid } .totals { display:flex; flex-wrap:wrap; gap:4px 18px; padding:7px 0; font-size:.9em } .totals span { display:flex; gap:6px; flex-wrap:wrap } .muted { color:#526070; font-size:.9em } footer { border-top:1px solid #aab2ba; margin-top:18px; padding-top:7px; color:#526070; font-size:.9em }
    ${thermal ? ".metadata { display:block } .metadata span { display:block } .cash-summary { padding:8px } .summary-heading { display:block } .expected { display:block; margin:6px 0 } .totals { display:block } .totals span { justify-content:space-between; padding:2px 0 }" : ""}`
}

export function ShiftReportButton({ context, actor }: { context: CashContext; actor: CashActorIdentity }) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function print() {
    // Abrir durante el clic evita que el navegador bloquee la ventana después de leer IndexedDB.
    const popup = window.open("", "_blank")
    if (!popup) { setError("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo de nuevo."); return }
    setBusy(true); setError("")
    popup.document.title = "Preparando detalle del turno"
    popup.document.body.textContent = "Preparando detalle del turno…"
    try {
      const report = await loadCashShiftReport(context, actor)
      if (popup.closed) throw new Error("La ventana de impresión se cerró antes de preparar el reporte")
      const doc = popup.document, style = doc.createElement("style"), container = doc.createElement("div")
      style.textContent = reportStyles(report.snapshot?.format ?? "CARTA")
      doc.title = "Detalle del turno"; doc.head.appendChild(style); doc.body.replaceChildren(container)
      flushSync(() => createRoot(container).render(<ShiftReport report={report} />))
      popup.focus(); popup.print()
    } catch (cause) {
      popup.close()
      setError(cause instanceof Error ? cause.message : "No se pudo preparar el detalle del turno")
    } finally { setBusy(false) }
  }
  return <div className="grid gap-1"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={print}><Printer className="h-4 w-4" aria-hidden="true" />{busy ? "Preparando…" : "Ver detalle del turno"}</Button>{error && <p role="alert" className="max-w-xs text-xs text-destructive">{error}</p>}</div>
}
