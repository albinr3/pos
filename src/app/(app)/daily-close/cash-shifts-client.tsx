"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/app/price-input"
import { discardCashPending, manualCashPending, sendManualCashMovement, cashPending, freezeCashShift, refreshCashContext, syncCashOutbox, unfreezeCashShift, type CashContext, type CashQueuedOperation } from "@/lib/cash-offline"
import { getPendingCounts } from "@/lib/indexed-db"
import { formatRD } from "@/lib/money"
import { formatDateTimeDO } from "@/lib/date-time"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import type { listCashHistory, previewCashActivation } from "@/lib/cash-shifts"
import type { CashClosingSnapshot } from "@/lib/cash-money"
import { snapshotBreakdown, snapshotSalesSummary } from "@/lib/cash-money"

type History = Awaited<ReturnType<typeof listCashHistory>>
type Preview = Awaited<ReturnType<typeof previewCashActivation>>
const pendingLabels: Record<CashQueuedOperation["kind"], string> = { sale: "Venta", payment: "Abono", batchPayment: "Abono múltiple", purchase: "Compra", ocrPurchase: "Compra por escaneo", expense: "Gasto", return: "Devolución", transfer: "Traspaso" }
async function post(body: object) {
  const response = await fetch("/api/cash-shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result.data
}
async function read(view: string) {
  const response = await fetch(`/api/cash-shifts?view=${view}`, { cache: "no-store" })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}
export function CashShiftsClient() {
  const [context, setContext] = useState<CashContext>()
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [history, setHistory] = useState<History>([])
  const [preview, setPreview] = useState<Preview>()
  const [pendingDiscard, setPendingDiscard] = useState("")
  const [discardReason, setDiscardReason] = useState("")
  const [manualPending, setManualPending] = useState<Awaited<ReturnType<typeof manualCashPending>>>(null)
  const [pending, setPending] = useState<CashQueuedOperation[]>([])
  const [accountId, setAccountId] = useState("")
  const [counted, setCounted] = useState(0)
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<History[number]>()
  const [kind, setKind] = useState("TRANSFER_OUT")
  const [movementAmount, setMovementAmount] = useState(0)
  const [otherAccount, setOtherAccount] = useState("")
  const [movementNote, setMovementNote] = useState("")
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([])
  const [correction, setCorrection] = useState<{ sourceType: string; sourceId: string }>()
  const [correctionReason, setCorrectionReason] = useState("")
  const [moneyMoved, setMoneyMoved] = useState(true)
  const refresh = useCallback(async () => {
    const state = await refreshCashContext()
    setContext(state)
    if (!state.canTransfer && state.canRecordMovements) setKind("OWNER_OUT")
    if (state.activeShift) setManualPending(await manualCashPending(state.activeShift.id)); else setManualPending(null)
    setPending((await cashPending()).filter(r => r.cashOperation.accountId === state.accountId))
    if (state.canOperate || state.canViewAll || state.canManage) { const rows = await read("history"); setHistory(rows); setHasMoreHistory(rows.length === 100) }
    if (state.enabled) {
      const response = await fetch("/api/treasury/accounts", { cache: "no-store" })
      if (response.ok) { const result = await response.json(); setAccounts(Array.isArray(result) ? result : result.data ?? result.accounts ?? []) }
    }
  }, [])
  useEffect(() => { void refresh().catch(e => setError(e.message)) }, [refresh])
  async function run(fn: () => Promise<unknown>, refreshAfter = true) {
    setBusy(true); setError("")
    try { await fn(); if (refreshAfter) await refresh() } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la acción") }
    finally { setBusy(false) }
  }
  async function noLegacyPending(all = true) {
    const legacy = await getPendingCounts()
    if (legacy.sales || legacy.payments) throw new Error("Sincroniza las ventas y abonos anteriores antes de activar o abrir la caja")
    const queued = await cashPending()
    if (queued.some(record => all || record.cashOperation.cashShiftId !== null)) throw new Error("Hay operaciones pendientes de este u otro turno. Resuélvelas antes de continuar")
  }
  const shift = context?.activeShift
  const owns = Boolean(shift?.isMine && shift.isDevice)
  const expected = shift?.expectedCashCents ?? context?.expectedOpeningCents ?? 0
  const snapshot = selected?.closingSnapshot as unknown as CashClosingSnapshot | undefined
  const summary = snapshot ? snapshotSalesSummary(snapshot.documents) : null
  return <section className="grid gap-4" aria-label="Turnos de caja">
    <Card><CardHeader><CardTitle>Turnos de caja</CardTitle></CardHeader><CardContent className="grid gap-4">
      {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</div>}
      {!context ? <p>Consultando caja…</p> : !context.enabled ? <>
        <p className="text-sm text-muted-foreground">El control por turnos está desactivado. Puedes seguir usando el resumen diario.</p>
        {context.canManage && <Button disabled={busy} onClick={() => run(async () => { await noLegacyPending(); setPreview(await read("preview")) })}>Revisar saldos y activar turnos</Button>}
        {preview && <div className="grid gap-3 rounded-md border p-4">
          <p>Antes de activar, confirma el efectivo físico. Las operaciones anteriores conservarán su historial y no se asignarán a empleados.</p>
          {preview.unclassified > 0 && <p className="text-amber-700">Hay {preview.unclassified} operación(es) anteriores sin cuenta o sin movimiento de dinero. Revisa los saldos iniciales; su importe no se asignará automáticamente.</p>}
          {preview.future > 0 && <p className="text-red-700">Revisa {preview.future} operación(es) con fecha futura antes de activar.</p>}
          <ul className="text-sm">{preview.accounts.map(a => <li key={a.id}>{a.name}: {formatRD(a.balanceCents)}</li>)}</ul>
          <Label htmlFor="cash-activation-account">Caja que usarán los empleados</Label>
          <select id="cash-activation-account" className="rounded-md border bg-background p-2" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Selecciona una caja</option>{preview.accounts.filter(a => a.type === "CAJA" && a.isActive && a.currency === "DOP").map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <Label htmlFor="cash-counted">Efectivo físico contado</Label><PriceInput id="cash-counted" valueCents={counted} onChangeCents={setCounted} />
          <Label htmlFor="cash-activation-note">Motivo de cualquier diferencia con el saldo anterior</Label><Input id="cash-activation-note" value={note} onChange={e => setNote(e.target.value)} />
          <p className="text-sm text-muted-foreground">Los dispositivos antiguos deben sincronizar antes de activar. Esta primera versión opera la caja desde la web.</p>
          <Button disabled={busy || !accountId || preview.future > 0} onClick={() => run(async () => { await noLegacyPending(); await post({ action: "activate", treasuryAccountId: accountId, countedCents: counted, note, previewToken: preview.previewToken }); setPreview(undefined); setNote("") })}>Confirmar y activar control por turnos</Button>
        </div>}
      </> : <>
        <p>{shift ? `Responsable: ${shift.cashierName} · ${shift.status === "OPEN" ? "Turno abierto" : "Cierre en preparación"}` : "No hay turno abierto. Cuenta el dinero físico que recibes para comenzar."}</p>
        {shift?.openingCountedCents !== null && shift?.openingCountedCents !== undefined && <p>Recibido al abrir: <strong>{formatRD(shift.openingCountedCents)}</strong></p>}
        {(owns || !shift || context.canViewAll || context.canManage) && <p>Efectivo esperado: <strong>{formatRD(expected)}</strong></p>}
        {context.breakdown.length > 0 && <div className="grid gap-2 rounded-md border p-3 text-sm"><p className="font-medium">Movimiento neto por método y cuenta</p>{context.breakdown.map((item, index) => <div key={index} className="flex justify-between gap-3"><span>{item.accountName} · {item.method ? getPaymentMethodLabel(item.method) : "Movimientos de tesorería"}</span><strong>{formatRD(item.totalCents)}</strong></div>)}</div>}
        {(!shift && context.canOperate || owns || context.canManage && shift) && <>
          <Label>Efectivo físico contado</Label><PriceInput valueCents={counted} onChangeCents={setCounted} disabled={busy} />
          <p className="text-sm">Diferencia: {formatRD(counted - expected)}</p>
          <Label htmlFor="cash-count-note">Motivo del sobrante o faltante</Label><Input id="cash-count-note" value={note} onChange={e => setNote(e.target.value)} disabled={busy} />
        </>}
        <div className="flex flex-wrap gap-2">
          {!shift && context.canOperate && <Button disabled={busy} onClick={() => run(async () => { await noLegacyPending(false); await post({ action: "open", countedCents: counted, note }); setNote("") })}>Abrir mi turno</Button>}
          {owns && shift?.status === "OPEN" && <Button disabled={busy} onClick={() => run(async () => {
            const finalSequence = await freezeCashShift(context)
            await post({ action: "prepare", shiftId: shift.id, finalSequence })
            await syncCashOutbox()
          })}>Preparar cierre y sincronizar</Button>}
          {owns && shift?.status === "CLOSING" && <>
            <Button disabled={busy} variant="secondary" onClick={() => run(() => syncCashOutbox())}>Sincronizar pendientes</Button>
            <Button disabled={busy || pending.some(record => record.cashOperation.cashShiftId === shift.id)} onClick={() => run(async () => { await post({ action: "close", shiftId: shift.id, countedCents: counted, expectedCents: expected, note }); setCounted(0); setNote("") })}>Confirmar cierre y entregar caja</Button>
            <Button disabled={busy} variant="outline" onClick={() => run(async () => { await post({ action: "resume", shiftId: shift.id }); await unfreezeCashShift(shift.id) })}>Reanudar turno</Button>
          </>}
          {shift && context.isOwner && !owns && <Button disabled={busy} variant="destructive" onClick={() => run(() => post({ action: "emergency", shiftId: shift.id, countedCents: counted, expectedCents: expected, note }))}>Cierre excepcional del dueño</Button>}
          {!shift && context.canManage && <Button disabled={busy} variant="outline" onClick={() => run(() => post({ action: "disable" }))}>Desactivar nuevos turnos</Button>}
          <Button variant="ghost" disabled={busy} onClick={() => run(refresh)}>Actualizar</Button>
        </div>
        {owns && shift?.status === "OPEN" && (context.canRecordMovements || context.canTransfer) && <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">Registrar entrada, retiro o traspaso</summary><div className="mt-3 grid gap-3">
          <Label htmlFor="cash-movement-type">Tipo de movimiento</Label><select id="cash-movement-type" className="rounded-md border bg-background p-2" value={kind} onChange={e => setKind(e.target.value)}>{context.canTransfer && <><option value="TRANSFER_OUT">Traspasar desde caja a otra cuenta</option><option value="TRANSFER_IN">Recibir desde otra cuenta</option></>}{context.canRecordMovements && <><option value="OWNER_IN">Aporte del propietario</option><option value="OWNER_OUT">Retiro del propietario</option></>}</select>
          {kind.startsWith("TRANSFER") && <><Label htmlFor="cash-other-account">Otra cuenta</Label><select id="cash-other-account" className="rounded-md border bg-background p-2" value={otherAccount} onChange={e => setOtherAccount(e.target.value)}><option value="">Selecciona una cuenta</option>{accounts.filter(a => a.id !== context.treasuryAccountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></>}
          <Label htmlFor="cash-movement-amount">Monto</Label><PriceInput id="cash-movement-amount" valueCents={movementAmount} onChangeCents={setMovementAmount} /><Label htmlFor="cash-movement-note">Motivo</Label><Input id="cash-movement-note" value={movementNote} onChange={e => setMovementNote(e.target.value)} />
          <Button disabled={busy} onClick={() => run(async () => { await sendManualCashMovement({ shiftId: shift.id, kind, amountCents: movementAmount, otherAccountId: otherAccount, note: movementNote }); setMovementAmount(0); setMovementNote("") })}>Registrar movimiento</Button>
        </div></details>}
      </>}
      {manualPending && <div className="rounded-md border border-amber-400 p-3"><p>Hay un movimiento de caja sin confirmación. Reinténtalo para verificar si fue registrado.</p>{manualPending.userId === context?.userId ? <Button disabled={busy} onClick={() => run(() => sendManualCashMovement(manualPending.input))}>Reintentar movimiento pendiente</Button> : <p>Vuelve al empleado que registró este movimiento para confirmarlo.</p>}</div>}
      {pending.length > 0 && <div className="rounded-md border border-amber-400 p-3"><p className="font-medium">Operaciones pendientes: {pending.length}</p>{pending.map(p => <div className="text-sm" key={p.id}><p>{pendingLabels[p.kind]} · {p.error ?? "Pendiente de sincronización"}</p>{p.cashOperation.userId === context?.userId && <Button variant="ghost" disabled={busy} onClick={() => setPendingDiscard(p.id)}>Anular pendiente con motivo</Button>}</div>)}</div>}
      {pendingDiscard && <div className="grid gap-2 rounded-md border p-3"><Label htmlFor="cash-discard-reason">Motivo para anular el pendiente</Label><Input id="cash-discard-reason" value={discardReason} onChange={e => setDiscardReason(e.target.value)} /><Button disabled={busy} onClick={() => run(async () => { await discardCashPending(pendingDiscard, discardReason); setPendingDiscard(""); setDiscardReason("") })}>Confirmar anulación del pendiente</Button></div>}
    </CardContent></Card>
    {history.length > 0 && <Card><CardHeader><CardTitle>Historial de turnos</CardTitle></CardHeader><CardContent className="grid gap-3">
      {history.map(row => <button type="button" key={row.id} onClick={() => { setSelected(row); setCorrection(undefined) }} className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-left text-sm"><span>{row.cashierName} · {formatDateTimeDO(row.openedAt)}</span><span>{row.status === "CLOSED" ? `Contado: ${formatRD(row.countedClosingCents ?? 0)} · Diferencia: ${formatRD(row.closingDifferenceCents ?? 0)}` : "En curso"}</span></button>)}
      {hasMoreHistory && <Button disabled={busy} variant="outline" onClick={() => run(async () => { const rows: History = await read(`history&before=${encodeURIComponent(history[history.length - 1].id)}`); setHistory(previous => [...previous, ...rows]); setHasMoreHistory(rows.length === 100) }, false)}>Cargar turnos anteriores</Button>}
    </CardContent></Card>}
    {selected?.status === "CLOSED" && <Card><CardHeader><CardTitle>Comprobante de cierre · {selected.cashierName}</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm">
      <p>Apertura: {formatDateTimeDO(selected.openedAt)} · Cierre: {selected.closedAt ? formatDateTimeDO(selected.closedAt) : ""}</p>
      <p>Recibido: {formatRD(selected.openingCountedCents)} · Diferencia de recepción: {formatRD(selected.openingDifferenceCents)}</p>{selected.openingNote && <p>Recepción: {selected.openingNote}</p>}
      <p>Esperado al cerrar: {formatRD(selected.expectedClosingCents ?? 0)} · Contado: {formatRD(selected.countedClosingCents ?? 0)}</p>
      <p className="font-semibold">Diferencia del turno: {formatRD(selected.closingDifferenceCents ?? 0)}</p>{selected.closingNote && <p>Motivo: {selected.closingNote}</p>}
      {snapshot?.emergency && <p>Cierre excepcional realizado por el dueño.</p>}
      {summary && <p>Ventas al contado: {formatRD(summary.cashSalesCents)} · Ventas a crédito: {formatRD(summary.creditSalesCents)} · Abonos: {formatRD(summary.collectionsCents)}</p>}
      {snapshot && <div className="rounded-md border p-3"><p className="font-medium">Movimiento neto por método y cuenta</p>{snapshotBreakdown(snapshot.movements).map((item, index) => <p key={index}>{item.accountName} · {item.method ? getPaymentMethodLabel(item.method) : "Tesorería"}: {formatRD(item.totalCents)}</p>)}</div>}
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Referencia</th><th>Método</th><th>Cuenta</th><th>Monto</th></tr></thead><tbody>{snapshot?.movements?.map((m) => <tr key={m.id}><td className="py-2">{m.reference}</td><td>{m.method ? getPaymentMethodLabel(m.method) : "Movimiento de tesorería"}</td><td>{m.treasuryAccount?.name ?? ""}</td><td>{formatRD(m.amountCents)}</td></tr>)}</tbody></table></div>
      <Button className="print:hidden" variant="outline" onClick={() => { const url = `/receipts/cash-shift/${encodeURIComponent(selected.id)}?autoprint=1`; const popup = window.open(url, "_blank"); if (!popup || popup.closed) window.location.href = url }}>Imprimir comprobante</Button>
      {snapshot?.documents?.filter((d) => ["sale", "payment", "purchase", "operatingExpense", "return", "treasuryTransfer"].includes(d.sourceType) && !d.cancelled).map((d) => <Button key={d.id} variant="ghost" className="justify-start print:hidden" onClick={() => setCorrection({ sourceType: d.sourceType, sourceId: d.id })}>Corregir operación {d.reference}</Button>)}
      {correction && <div className="grid gap-3 rounded-md border p-3 print:hidden"><p>El cierre conservará sus importes. La corrección queda relacionada con la operación original.</p><Label htmlFor="cash-correction-reason">Motivo</Label><Input id="cash-correction-reason" value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} /><label className="flex items-center gap-2"><input type="checkbox" checked={moneyMoved} onChange={e => setMoneyMoved(e.target.checked)} />Hubo devolución o recuperación real del dinero</label><p>Si hubo efectivo, debe registrarlo el responsable desde su turno abierto.</p><Button disabled={busy} onClick={() => run(async () => { await post({ action: "correct", ...correction, reason: correctionReason, moneyMoved }); setCorrection(undefined); setCorrectionReason("") })}>Confirmar reverso</Button></div>}
    </CardContent></Card>}
  </section>
}
