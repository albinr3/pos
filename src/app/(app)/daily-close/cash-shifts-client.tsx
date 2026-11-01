"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/app/price-input"
import { CashShiftWorkspace } from "@/components/app/cash-shift-workspace"
import { ShiftCollectionsSummary } from "@/components/app/shift-collections-summary"
import { discardCashPending, manualCashPending, sendManualCashMovement, cashPending, freezeCashShift, refreshCashContext, syncCashOutbox, unfreezeCashShift, type CashContext, type CashQueuedOperation } from "@/lib/cash-offline"
import { assertNoCashOpeningPending, openCashShiftFromClient } from "@/lib/cash-shift-opening"
import { formatRD } from "@/lib/money"
import { formatDateTimeDO } from "@/lib/date-time"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import type { listCashHistory, previewCashActivation } from "@/lib/cash-shifts"
import type { CashClosingSnapshot } from "@/lib/cash-money"
import { shiftCollectionsByMethod, snapshotBreakdown, snapshotSalesSummary } from "@/lib/cash-money"

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
  const [activationCountEntered, setActivationCountEntered] = useState(false)
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
  const [closedShiftId, setClosedShiftId] = useState<string>()
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
    let failure: string | undefined
    try { await fn() } catch (e) { failure = e instanceof Error ? e.message : "No se pudo completar la acción" }
    // Preparar puede confirmar CLOSING antes de fallar la sincronización. Mostrar siempre el estado real y sus pendientes.
    if (refreshAfter) { try { await refresh() } catch (e) { failure ??= e instanceof Error ? e.message : "No se pudo actualizar la caja" } }
    setError(failure ?? ""); setBusy(false)
  }
  const shift = context?.activeShift
  const owns = Boolean(shift?.isMine && shift.isDevice)
  const activationAccount = preview?.accounts.find(account => account.id === accountId)
  const activationDifference = activationAccount ? counted - activationAccount.balanceCents : null
  const snapshot = selected?.closingSnapshot as unknown as CashClosingSnapshot | undefined
  const summary = snapshot ? snapshotSalesSummary(snapshot.documents) : null
  return <section className="grid gap-4" aria-label="Turnos de caja">
    <Card><CardHeader><CardTitle>Turnos de caja</CardTitle>{context?.enabled && <p className="text-sm text-muted-foreground">Revisa todos los cobros de tu turno y el efectivo que vas a entregar.</p>}</CardHeader><CardContent className="grid gap-5">
      {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</div>}
      {!context ? <p>Consultando caja…</p> : !context.enabled ? <>
        <p className="text-sm text-muted-foreground">El control por turnos está desactivado. Puedes seguir usando el resumen diario.</p>
        {context.canManage && <Button disabled={busy} onClick={() => run(async () => { await assertNoCashOpeningPending(true); setPreview(await read("preview")); setActivationCountEntered(false) })}>Revisar saldos y activar turnos</Button>}
        {preview && <div className="grid gap-3 rounded-md border p-4">
          <div className="grid gap-1"><h3 className="font-semibold">Prepara tu caja para trabajar por turnos</h3><p className="text-sm text-muted-foreground">Esta revisión se hace al activar el control. Después, cada empleado abrirá y cerrará su propio turno.</p></div>
          <p className="text-sm">Las operaciones anteriores a la primera activación conservarán su historial. Como entonces no había turnos registrados, no se asignarán a ninguno.</p>
          {preview.unclassified > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><p className="font-medium">Revisa {preview.unclassified} operación(es) anteriores</p><p>No tienen un movimiento de dinero identificado en una cuenta. Algunas pueden no haber movido dinero; otras pueden no tener una cuenta registrada. Sus importes no se asignan automáticamente, así que revisa los saldos antes de continuar.</p></div>}
          {preview.future > 0 && <p className="text-red-700">Revisa {preview.future} operación(es) con fecha futura antes de activar.</p>}
          <div className="grid gap-1 text-sm"><p className="font-medium">Saldos calculados por el sistema</p><p className="text-muted-foreground">Se basan en los movimientos con cuenta identificada. Compara el saldo de caja con el dinero que tienes físicamente.</p><ul>{preview.accounts.map(a => <li key={a.id}>{a.name}: <strong>{formatRD(a.balanceCents)}</strong></li>)}</ul></div>
          <Label htmlFor="cash-activation-account">Caja que usarán los empleados</Label>
          <select id="cash-activation-account" className="rounded-md border bg-background p-2" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Selecciona una caja</option>{preview.accounts.filter(a => a.type === "CAJA" && a.isActive && a.currency === "DOP").map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          {activationAccount && <p className="text-sm">Para <strong>{activationAccount.name}</strong>, el sistema calcula <strong>{formatRD(activationAccount.balanceCents)}</strong>.</p>}
          <Label htmlFor="cash-counted">¿Cuánto efectivo hay en la caja?</Label><PriceInput id="cash-counted" valueCents={counted} onChangeCents={value => { setCounted(value); setActivationCountEntered(true) }} />
          <p className="text-sm text-muted-foreground">Cuenta los billetes y monedas y escribe el total real. {activationAccount && activationAccount.balanceCents >= 0 && <>Si cuentas {formatRD(activationAccount.balanceCents)}, introduce ese mismo monto. </>}Escribe 0 solo si la caja está vacía.</p>
          {activationCountEntered && activationDifference !== null && <p className="text-sm" aria-live="polite">{activationDifference === 0 ? "El efectivo contado coincide con el saldo calculado." : <>Diferencia: <strong>{formatRD(Math.abs(activationDifference))} {activationDifference < 0 ? "menos" : "más"}</strong> que el saldo calculado. Explica el motivo; la diferencia se registrará al activar.</>}</p>}
          <Label htmlFor="cash-activation-note">Motivo de la diferencia {activationCountEntered && activationDifference !== null && activationDifference !== 0 ? "(obligatorio)" : "(solo si hay diferencia)"}</Label><Input id="cash-activation-note" value={note} onChange={e => setNote(e.target.value)} />
          <p className="text-sm text-muted-foreground">Antes de activar, sincroniza las ventas y los abonos pendientes de todos los dispositivos. Los turnos se usan desde la web.</p>
          {/* La base de activación no confirma el conteo con el que un empleado recibe su turno. */}
          <Button disabled={busy || !accountId || preview.future > 0} onClick={() => run(async () => { await assertNoCashOpeningPending(true); await post({ action: "activate", treasuryAccountId: accountId, countedCents: counted, note, previewToken: preview.previewToken }); setPreview(undefined); setCounted(0); setNote("") })}>Confirmar y activar control por turnos</Button>
        </div>}
      </> : <>
        {closedShiftId && !shift && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><div><p className="font-semibold">El turno quedó cerrado</p><p>El conteo y las diferencias ya están guardados. El siguiente empleado puede abrir su turno.</p></div><Button asChild variant="outline"><a href={`/receipts/cash-shift/${encodeURIComponent(closedShiftId)}`} target="_blank" rel="noopener noreferrer">Ver comprobante</a></Button></div>}
        <CashShiftWorkspace key={`${shift?.id ?? "opening"}:${shift?.status ?? "none"}`} context={context} busy={busy} pendingCount={pending.filter(record => record.cashOperation.cashShiftId === shift?.id).length} manualPending={Boolean(manualPending)} counted={counted} note={note} onCountChange={setCounted} onNoteChange={setNote} actions={{
          open: () => run(async () => { await openCashShiftFromClient({ id: context.userId, accountId: context.accountId }, counted, note); setNote(""); setClosedShiftId(undefined) }),
          prepare: () => run(async () => {
            if (!shift) return
            const finalSequence = await freezeCashShift(context)
            await post({ action: "prepare", shiftId: shift.id, finalSequence })
            // El conteo de apertura no es un conteo de cierre: el cajero debe introducir uno nuevo.
            setCounted(0); setNote("")
            await syncCashOutbox()
          }),
          sync: () => run(() => syncCashOutbox()),
          close: () => run(async () => { if (!shift) return; await post({ action: "close", shiftId: shift.id, countedCents: counted, expectedCents: shift.expectedCashCents, note }); setClosedShiftId(shift.id); setCounted(0); setNote("") }),
          resume: () => run(async () => { if (!shift) return; await post({ action: "resume", shiftId: shift.id }); await unfreezeCashShift(shift.id); setCounted(0); setNote("") }),
          emergency: () => run(async () => { if (!shift) return; await post({ action: "emergency", shiftId: shift.id, countedCents: counted, expectedCents: shift.expectedCashCents, note }); setClosedShiftId(shift.id); setCounted(0); setNote("") }),
          refresh: () => run(async () => {}),
          disable: () => run(() => post({ action: "disable" })),
        }} />
        {owns && shift?.status === "OPEN" && (context.canRecordMovements || context.canTransfer) && <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Registrar dinero que entra o sale</summary><div className="mt-4 grid gap-3">
          <p className="text-sm text-muted-foreground">Registra aquí el dinero que muevas durante tu turno. Si lo pasas a otra cuenta, elige de dónde sale o dónde lo guardarás.</p>
          <Label htmlFor="cash-movement-type">¿Qué vas a hacer con el dinero?</Label><select id="cash-movement-type" className="rounded-md border bg-background p-2" value={kind} onChange={e => setKind(e.target.value)}>{context.canTransfer && <><option value="TRANSFER_OUT">Pasar dinero de caja a otra cuenta</option><option value="TRANSFER_IN">Traer dinero de otra cuenta a caja</option></>}{context.canRecordMovements && <><option value="OWNER_IN">El dueño agrega dinero a la caja</option><option value="OWNER_OUT">El dueño retira dinero de la caja</option></>}</select>
          {kind.startsWith("TRANSFER") && <><Label htmlFor="cash-other-account">{kind === "TRANSFER_OUT" ? "¿Dónde guardarás ese dinero?" : "¿De qué cuenta viene el dinero?"}</Label><select id="cash-other-account" className="rounded-md border bg-background p-2" value={otherAccount} onChange={e => setOtherAccount(e.target.value)}><option value="">Selecciona una cuenta</option>{accounts.filter(a => a.id !== context.treasuryAccountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></>}
          <Label htmlFor="cash-movement-amount">Monto</Label><PriceInput id="cash-movement-amount" valueCents={movementAmount} onChangeCents={setMovementAmount} /><Label htmlFor="cash-movement-note">Motivo</Label><Input id="cash-movement-note" value={movementNote} onChange={e => setMovementNote(e.target.value)} />
          <Button disabled={busy || Boolean(manualPending) || movementAmount <= 0 || !movementNote.trim() || kind.startsWith("TRANSFER") && !otherAccount} onClick={() => run(async () => { await sendManualCashMovement({ shiftId: shift.id, kind, amountCents: movementAmount, otherAccountId: otherAccount, note: movementNote }); setMovementAmount(0); setMovementNote("") })}>Guardar movimiento de dinero</Button>
        </div></details>}
      </>}
      {manualPending && <div className="rounded-md border border-amber-400 p-3"><p>Hay un movimiento de caja sin confirmación. Reinténtalo para verificar si fue registrado.</p>{manualPending.userId === context?.userId ? <Button disabled={busy} onClick={() => run(() => sendManualCashMovement(manualPending.input))}>Reintentar movimiento pendiente</Button> : <p>Vuelve al empleado que registró este movimiento para confirmarlo.</p>}</div>}
      {pending.length > 0 && <div className="rounded-md border border-amber-400 p-3"><p className="font-medium">Operaciones pendientes: {pending.length}</p>{pending.map(p => <div className="text-sm" key={p.id}><p>{pendingLabels[p.kind]} · {p.error ?? "Pendiente de sincronización"}</p>{p.cashOperation.userId === context?.userId && <Button variant="ghost" disabled={busy} onClick={() => setPendingDiscard(p.id)}>Anular pendiente con motivo</Button>}</div>)}</div>}
      {pendingDiscard && <div className="grid gap-2 rounded-md border p-3"><Label htmlFor="cash-discard-reason">Motivo para anular el pendiente</Label><Input id="cash-discard-reason" value={discardReason} onChange={e => setDiscardReason(e.target.value)} /><Button disabled={busy} onClick={() => run(async () => { await discardCashPending(pendingDiscard, discardReason); setPendingDiscard(""); setDiscardReason("") })}>Confirmar anulación del pendiente</Button></div>}
    </CardContent></Card>
    {history.length > 0 && <Card><CardHeader><CardTitle>Historial de turnos</CardTitle></CardHeader><CardContent className="grid gap-3">
      {history.map(row => <button type="button" key={row.id} onClick={() => { setSelected(row); setCorrection(undefined) }} className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-left text-sm"><span>{row.cashierName} · {formatDateTimeDO(row.openedAt)}</span><span>{row.status === "CLOSED" ? `Efectivo contado: ${formatRD(row.countedClosingCents ?? 0)} · Diferencia de efectivo: ${formatRD(row.closingDifferenceCents ?? 0)}` : "En curso"}</span></button>)}
      {hasMoreHistory && <Button disabled={busy} variant="outline" onClick={() => run(async () => { const rows: History = await read(`history&before=${encodeURIComponent(history[history.length - 1].id)}`); setHistory(previous => [...previous, ...rows]); setHasMoreHistory(rows.length === 100) }, false)}>Cargar turnos anteriores</Button>}
    </CardContent></Card>}
    {selected?.status === "CLOSED" && <Card><CardHeader><CardTitle>Comprobante de cierre · {selected.cashierName}</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm">
      <p>Apertura: {formatDateTimeDO(selected.openedAt)} · Cierre: {selected.closedAt ? formatDateTimeDO(selected.closedAt) : ""}</p>
      {snapshot && <ShiftCollectionsSummary collections={shiftCollectionsByMethod(snapshot.movements)} />}
      <h3 className="mt-2 font-semibold">Efectivo entregado</h3>
      <p>Efectivo recibido al abrir: {formatRD(selected.openingCountedCents)} · Diferencia de efectivo al recibir: {formatRD(selected.openingDifferenceCents)}</p>{selected.openingNote && <p>Recepción: {selected.openingNote}</p>}
      <p>Efectivo esperado al cerrar: {formatRD(selected.expectedClosingCents ?? 0)} · Efectivo contado: {formatRD(selected.countedClosingCents ?? 0)}</p>
      <p className="font-semibold">Diferencia de efectivo del turno: {formatRD(selected.closingDifferenceCents ?? 0)}</p>{selected.closingNote && <p>Motivo: {selected.closingNote}</p>}
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
