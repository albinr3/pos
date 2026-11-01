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
  const methods = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO", "SIN_METODO"]
  const methodOf = (method: string | null) => method === null ? "SIN_METODO" : methods.includes(method) ? method : "OTRO"
  const isExpense = (type: string) => ["purchase", "ocrPurchase", "operatingExpense", "expense", "return"].includes(type)
  const expenses = movements.filter(row => isExpense(row.sourceType))
  const expenseDocuments = snapshot?.documents.filter(row => isExpense(row.sourceType)) ?? []
  const otherDocuments = snapshot?.documents.filter(row => !isExpense(row.sourceType)) ?? []
  const customerLabel = (type: string, name?: string | null) => ["sale", "payment", "return"].includes(type) ? name || "Cliente no disponible" : null
  return <main className="report">
    <header><div className="eyebrow">CUADRE DE CAJA · DETALLE DEL TURNO</div><h1>{snapshot?.companyName ?? "Detalle del turno"}</h1><div className="metadata"><span><b>Cajero:</b> {snapshot?.cashierName ?? context.activeShift?.cashierName}</span><span><b>Apertura:</b> {formatDateTimeDO(snapshot?.openedAt ?? context.activeShift!.openedAt)}</span><span><b>Impreso:</b> {formatDateTimeDO(report.generatedAt)}</span></div></header>
    {provisional && <div className="warning"><strong>REPORTE PROVISIONAL O INCOMPLETO</strong><p>{snapshot ? `Última actualización del servidor: ${formatDateTimeDO(snapshot.generatedAt)}.` : "No hay una copia previa del detalle confirmado en este dispositivo."} Puede haber operaciones aún no reflejadas. Este documento no confirma el cierre.</p></div>}
    {snapshot && <section><h2>Transacciones por método de pago</h2>{methods.map(method => {
      const rows = movements.filter(m => !isExpense(m.sourceType) && methodOf(m.method) === method)
      if (!rows.length && !["EFECTIVO", "TARJETA", "TRANSFERENCIA"].includes(method)) return null
      return <div className="group" key={method}><div className="group-heading"><h3>{method === "SIN_METODO" ? "Tesorería y movimientos sin método" : getPaymentMethodLabel(method)}</h3><span>{rows.length} {rows.length === 1 ? "movimiento" : "movimientos"}</span></div>
        {rows.length === 0 ? <p className="muted">Sin movimientos</p> : rows.map(row => <div className="movement line" key={row.id}><div><div><strong>{movementName(row.sourceType)}</strong> · {row.reference}</div>{customerLabel(row.sourceType, row.customerName) && <div>Cliente: {customerLabel(row.sourceType, row.customerName)}</div>}<div className="muted">{formatDateTimeDO(row.recordedAt)} · {row.treasuryAccount.name}</div>{row.note && <div className="muted">{row.note}</div>}</div><strong>{formatRD(row.amountCents)}</strong></div>)}
        {rows.length > 0 && method !== "SIN_METODO" && <div className="line group-total"><span>Total de movimientos</span><strong>{formatRD(rows.reduce((sum, row) => sum + row.amountCents, 0))}</strong></div>}
      </div>
    })}</section>}
    {otherDocuments.length > 0 && <section><h2>Operaciones sin movimiento de dinero</h2><p className="section-intro">No se suman a los movimientos por método de pago.</p>{otherDocuments.map(row => <div className="line movement" key={`${row.sourceType}:${row.id}`}><div>{movementName(row.sourceType)} · {row.reference}{row.cancelled ? " · Anulada" : ""}{customerLabel(row.sourceType, row.customerName) && <div>Cliente: {customerLabel(row.sourceType, row.customerName)}</div>}{row.recordedAt && <div className="muted">{formatDateTimeDO(row.recordedAt)}</div>}</div><strong>{formatRD(row.amountCents)}</strong></div>)}</section>}
    {local.length > 0 && <section className="pending"><h2>Operaciones locales por verificar</h2><p>Se muestran por separado y no se suman a los importes confirmados.</p>{local.map(row => {
      const method = row.payload.method ?? row.payload.paymentMethod
      const splits = Array.isArray(row.payload.paymentSplits) ? row.payload.paymentSplits as Array<{ method?: string; amountCents?: number }> : []
      const amount = row.amountCents ?? (typeof row.payload.amountCents === "number" ? row.payload.amountCents : undefined)
      return <div className="movement" key={row.id}><div><strong>{movementName(row.kind)}</strong> · {row.reference ?? row.id}</div><div>{row.status === "confirmed" ? "Confirmada; aún no incorporada a la copia" : "Pendiente o por confirmar"}{row.error ? ` · ${row.error}` : ""}{row.recordedAt && <> · {formatDateTimeDO(row.recordedAt)}</>}</div>{typeof method === "string" && <div>{getPaymentMethodLabel(method)}</div>}{typeof amount === "number" && <div>Importe indicado: {formatRD(amount)}</div>}{splits.map((split, index) => <div key={index}>{getPaymentMethodLabel(split.method ?? "OTRO")}{typeof split.amountCents === "number" ? ` · ${formatRD(split.amountCents)}` : ""}</div>)}</div>
    })}</section>}
    {(expenses.length > 0 || expenseDocuments.length > 0) && <section><h2>Gastos, compras y devoluciones</h2>{expenses.map(row => <div className="line movement" key={row.id}><div><strong>{movementName(row.sourceType)}</strong> · {row.reference}{customerLabel(row.sourceType, row.customerName) && <div>Cliente: {customerLabel(row.sourceType, row.customerName)}</div>}<div className="muted">{row.method ? getPaymentMethodLabel(row.method) : "Sin método"} · {formatDateTimeDO(row.recordedAt)} · {row.treasuryAccount.name}</div>{row.note && <div className="muted">{row.note}</div>}</div><strong>{formatRD(row.amountCents)}</strong></div>)}{expenseDocuments.map(row => <div className="line movement" key={`${row.sourceType}:${row.id}`}><div><strong>{movementName(row.sourceType)}</strong> · {row.reference}{row.cancelled ? " · Anulada" : ""}{customerLabel(row.sourceType, row.customerName) && <div>Cliente: {customerLabel(row.sourceType, row.customerName)}</div>}<div className="muted">Sin movimiento de dinero{row.recordedAt && <> · {formatDateTimeDO(row.recordedAt)}</>}</div></div><strong>{formatRD(row.amountCents)}</strong></div>)}</section>}
    {snapshot && <footer><div className="line"><span>Fondo recibido al abrir</span><strong>{formatRD(snapshot.openingCents)}</strong></div><div className="line"><span>Efectivo esperado en caja</span><strong>{formatRD(snapshot.expectedCashCents)}</strong></div><p>Información disponible al {formatDateTimeDO(snapshot.generatedAt)}. No confirma el cierre.</p>Los traspasos se muestran en sus cuentas de origen y destino.</footer>}
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
    .movement { border-bottom:1px solid #d5d9dd; padding:7px 0; break-inside:avoid } .group-total { padding:6px 0; font-weight:bold } .muted { color:#526070; font-size:.9em } footer { border-top:1px solid #aab2ba; margin-top:18px; padding-top:7px; color:#526070; font-size:.9em }
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
