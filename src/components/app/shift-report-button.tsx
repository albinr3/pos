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
    <header><h1>{snapshot?.companyName ?? "Detalle del turno"}</h1><h2>Detalle del turno</h2><p>Responsable: {snapshot?.cashierName ?? context.activeShift?.cashierName}</p><p>Apertura: {formatDateTimeDO(snapshot?.openedAt ?? context.activeShift!.openedAt)}</p><p>Impreso: {formatDateTimeDO(report.generatedAt)}</p></header>
    {provisional && <div className="warning"><strong>REPORTE PROVISIONAL O INCOMPLETO</strong><p>{snapshot ? `Última actualización del servidor: ${formatDateTimeDO(snapshot.generatedAt)}.` : "No hay una copia previa del detalle confirmado en este dispositivo."} Puede haber operaciones aún no reflejadas. Este documento no confirma el cierre.</p></div>}
    {snapshot && <section><h2>Resumen de efectivo</h2><div className="line"><span>Recibido al abrir</span><strong>{formatRD(snapshot.openingCents)}</strong></div><div className="line"><span>Efectivo esperado al actualizar</span><strong>{formatRD(snapshot.expectedCashCents)}</strong></div></section>}
    {snapshot && <section><h2>Movimientos por método de pago</h2>{methods.map(method => {
      const rows = movements.filter(m => methodOf(m.method) === method)
      if (!rows.length && !["EFECTIVO", "TARJETA", "TRANSFERENCIA"].includes(method)) return null
      const collections = rows.filter(m => m.sourceType === "sale" || m.sourceType === "payment").reduce((sum, m) => sum + m.amountCents, 0)
      const other = rows.filter(m => ["purchase", "operatingExpense", "return"].includes(m.sourceType)).reduce((sum, m) => sum + m.amountCents, 0)
      return <div className="group" key={method}><h3>{method === "SIN_METODO" ? "Tesorería y movimientos sin método" : getPaymentMethodLabel(method)}</h3>
        {method !== "SIN_METODO" && <div className="totals"><span>Cobros netos: {formatRD(collections)}</span><span>Gastos, compras y devoluciones: {formatRD(other)}</span></div>}
        {rows.length === 0 ? <p className="muted">Sin movimientos</p> : rows.map(row => <div className="movement" key={row.id}><div><strong>{movementName(row.sourceType)}</strong> · {row.reference}</div><div className="line"><span>{formatDateTimeDO(row.recordedAt)} · {row.treasuryAccount.name}</span><strong>{formatRD(row.amountCents)}</strong></div>{row.note && <div className="muted">{row.note}</div>}</div>)}
      </div>
    })}</section>}
    {snapshot && snapshot.documents.length > 0 && <section><h2>Operaciones sin movimiento de dinero</h2>{snapshot.documents.map(row => <div className="line movement" key={`${row.sourceType}:${row.id}`}><span>{movementName(row.sourceType)} · {row.reference}{row.cancelled ? " · Anulada" : ""} {row.recordedAt && <>· {formatDateTimeDO(row.recordedAt)}</>}</span><strong>{formatRD(row.amountCents)}</strong></div>)}</section>}
    {local.length > 0 && <section><h2>Operaciones locales por verificar</h2><p>Se muestran por separado y no se suman a los importes confirmados.</p>{local.map(row => {
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
  return `@page { size: ${thermal ? "80mm auto" : "A4"}; margin: ${thermal ? "3mm" : "12mm"}; } * { box-sizing:border-box } body { margin:0; color:#111; background:#fff; font: ${thermal ? "11px" : "13px"} Arial,sans-serif } .report { width:${thermal ? "74mm" : "100%"}; margin:auto; overflow-wrap:anywhere } header { text-align:center; border-bottom:1px solid #aaa; padding-bottom:8px } h1 { font-size:1.3em; margin:0 0 5px } h2 { font-size:1.15em; margin:12px 0 5px } h3 { font-size:1.05em; margin:10px 0 4px } p { margin:4px 0 } section { margin-top:10px } .warning { border:2px solid #111; padding:6px; margin-top:10px } .line { display:flex; justify-content:space-between; align-items:baseline; gap:8px } .line strong { white-space:nowrap } .group { break-inside:auto } .movement { border-bottom:1px solid #ddd; padding:5px 0; break-inside:avoid } .totals { display:flex; flex-wrap:wrap; gap:4px 16px; font-size:.9em } .muted { color:#555; font-size:.9em } footer { border-top:1px solid #aaa; margin-top:12px; padding-top:7px; font-size:.9em }`
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
