"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Printer, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/app/price-input"
import { CashShiftWorkspace } from "@/components/app/cash-shift-workspace"
import { CashControlActivation } from "@/components/app/cash-control-activation"
import { ShiftCollectionsSummary } from "@/components/app/shift-collections-summary"
import { clearCashShiftReport, discardCashPending, manualCashPending, sendManualCashMovement, cashPending, freezeCashShift, refreshCashContext, syncCashOutbox, unfreezeCashShift, type CashContext, type CashQueuedOperation } from "@/lib/cash-offline"
import { openCashShiftFromClient } from "@/lib/cash-shift-opening"
import { formatRD } from "@/lib/money"
import { formatDateTimeDO } from "@/lib/date-time"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import type { listCashHistory } from "@/lib/cash-shifts"
import type { CashClosingSnapshot } from "@/lib/cash-money"
import { shiftCollectionsByMethod, snapshotBreakdown, snapshotSalesSummary } from "@/lib/cash-money"

type History = Awaited<ReturnType<typeof listCashHistory>>
const HISTORY_PAGE_SIZE = 10
const SHIFT_REMINDER_KEY = "cash-shift-reminder-dismissed"
const pendingLabels: Record<CashQueuedOperation["kind"], string> = { sale: "Venta", payment: "Abono", batchPayment: "Abono múltiple", purchase: "Compra", supplierPayment: "Pago a proveedor", ocrPurchase: "Compra por escaneo", expense: "Gasto", return: "Devolución", transfer: "Traspaso" }
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
  const [reminderDismissed, setReminderDismissed] = useState<boolean | null>(null)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [history, setHistory] = useState<History>([])
  const [historyPage, setHistoryPage] = useState(0)
  const [activating, setActivating] = useState(false)
  const [pendingDiscard, setPendingDiscard] = useState("")
  const [discardReason, setDiscardReason] = useState("")
  const [manualPending, setManualPending] = useState<Awaited<ReturnType<typeof manualCashPending>>>(null)
  const [pending, setPending] = useState<CashQueuedOperation[]>([])
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
  const [closedShiftId, setClosedShiftId] = useState<string>()
  const [provisionalClose, setProvisionalClose] = useState(false)
  // El panel se desmonta al cambiar el estado; conservar la intención del clic fuera de él.
  const revealClosingRef = useRef<string | null>(null)
  const refresh = useCallback(async () => {
    const state = await refreshCashContext()
    // La preferencia pertenece al usuario y negocio actuales, incluso en dispositivos compartidos.
    try { setReminderDismissed(localStorage.getItem(`${SHIFT_REMINDER_KEY}:${state.accountId}:${state.userId}`) === "1") } catch { setReminderDismissed(false) }
    setContext(state)
    if (!state.canTransfer && state.canRecordMovements) setKind("OWNER_OUT")
    if (state.activeShift) setManualPending(await manualCashPending(state.activeShift.id)); else setManualPending(null)
    setPending((await cashPending()).filter(r => r.cashOperation.accountId === state.accountId))
    // El permiso de operar caja no autoriza a mostrar el historial de cierres.
    if (state.canViewAll) { const rows: History = await read(`history&limit=${HISTORY_PAGE_SIZE + 1}`); setHistory(rows.slice(0, HISTORY_PAGE_SIZE)); setHasMoreHistory(rows.length > HISTORY_PAGE_SIZE) }
    else { setHistory([]); setHasMoreHistory(false) }
    setHistoryPage(0); setSelected(undefined)
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
  const snapshot = selected?.closingSnapshot as unknown as CashClosingSnapshot | undefined
  const summary = snapshot ? snapshotSalesSummary(snapshot.documents) : null
  function dismissReminder() {
    if (!context) return
    // Mantener el aviso descartado al volver a entrar desde este navegador.
    try { localStorage.setItem(`${SHIFT_REMINDER_KEY}:${context.accountId}:${context.userId}`, "1") } catch { /* El aviso se oculta durante esta visita si el navegador bloquea el almacenamiento. */ }
    setReminderDismissed(true)
  }
  return <section className="grid gap-4" aria-label="Turnos de caja">
    <Card><CardHeader><CardTitle>Turnos de caja</CardTitle>{context?.enabled && <p className="text-sm text-muted-foreground">Revisa todos los cobros de tu turno y el efectivo que vas a entregar.</p>}</CardHeader><CardContent className="grid gap-5">
      {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</div>}
      {!context ? <p>Consultando caja…</p> : !context.enabled ? <>
        {reminderDismissed === false && !activating && <div className="grid gap-4 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start justify-between gap-3"><div className="space-y-1"><p className="font-semibold">¿Trabajas con varios turnos o empleados?</p><p className="text-sm text-muted-foreground">Activa el cuadre por turnos para que cada empleado abra y cierre su turno de caja.</p></div><Button variant="ghost" size="icon" className="shrink-0" aria-label="Descartar recordatorio" onClick={dismissReminder}><X className="h-4 w-4" aria-hidden="true" /></Button></div>
          <div className="flex flex-wrap gap-2">
            {context.canManage && <Button disabled={busy} onClick={() => setActivating(true)}>Activar ahora</Button>}
            <Button variant="outline" onClick={dismissReminder}>Descartar y no volver a mostrar</Button>
          </div>
        </div>}
        {reminderDismissed && !activating && context.canManage && <Button variant="outline" className="justify-self-start" disabled={busy} onClick={() => setActivating(true)}>Activar turnos de caja</Button>}
        {activating && <CashControlActivation key={`${context.accountId}:${context.userId}`} context={context} onCancel={() => setActivating(false)} onActivated={next => {
          setContext(next); setActivating(false)
          void refresh().catch(error => setError(error instanceof Error ? error.message : "No se pudo actualizar la caja"))
        }} />}
      </> : <>
        {closedShiftId && !shift && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><div><p className="font-semibold">El turno quedó cerrado</p><p>El conteo y las diferencias ya están guardados. El siguiente empleado puede abrir su turno.</p></div><Button asChild variant="outline"><a href={`/receipts/cash-shift/${encodeURIComponent(closedShiftId)}`} target="_blank" rel="noopener noreferrer">Ver comprobante</a></Button></div>}
        <CashShiftWorkspace key={`${shift?.id ?? "opening"}:${shift?.status ?? "none"}`} context={context} provisionalClose={provisionalClose} revealClosingRef={revealClosingRef} busy={busy} pendingCount={pending.filter(record => record.cashOperation.cashShiftId === shift?.id).length} manualPending={Boolean(manualPending)} counted={counted} note={note} onCountChange={setCounted} onNoteChange={setNote} actions={{
          open: () => run(async () => { await openCashShiftFromClient({ id: context.userId, accountId: context.accountId }, counted, note); setNote(""); setClosedShiftId(undefined) }),
          prepare: () => {
            if (!shift) return
            revealClosingRef.current = shift.id
            if (!navigator.onLine) { setProvisionalClose(true); return }
            return run(async () => {
              const finalSequence = await freezeCashShift(context)
              await post({ action: "prepare", shiftId: shift.id, finalSequence })
              setProvisionalClose(false)
              // El conteo de apertura no es un conteo de cierre: el cajero debe introducir uno nuevo.
              setCounted(0); setNote("")
              await syncCashOutbox()
            })
          },
          sync: () => run(() => syncCashOutbox()),
          close: () => run(async () => { if (!shift) return; await post({ action: "close", shiftId: shift.id, countedCents: counted, expectedCents: shift.expectedCashCents, note }); await clearCashShiftReport(context).catch(() => {}); setClosedShiftId(shift.id); setCounted(0); setNote("") }),
          resume: () => { if (provisionalClose && shift?.status !== "CLOSING") { setProvisionalClose(false); setCounted(0); setNote(""); return } return run(async () => { if (!shift) return; await post({ action: "resume", shiftId: shift.id }); await unfreezeCashShift(shift.id); setProvisionalClose(false); setCounted(0); setNote("") }) },
          emergency: () => run(async () => { if (!shift) return; await post({ action: "emergency", shiftId: shift.id, countedCents: counted, expectedCents: shift.expectedCashCents, note }); setClosedShiftId(shift.id); setCounted(0); setNote("") }),
          refresh: () => run(async () => {}),
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
    {context?.canViewAll && history.length > 0 && <Card><CardContent><Accordion type="single" collapsible><AccordionItem value="history" className="border-0"><AccordionTrigger className="text-lg font-semibold">Historial de turnos</AccordionTrigger><AccordionContent>
      <Accordion type="single" collapsible value={selected?.id ?? ""} onValueChange={id => { setSelected(history.find(row => row.id === id)); setCorrection(undefined) }}>
      {history.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE).map(row => <AccordionItem key={row.id} value={row.id}><AccordionTrigger className="gap-3 text-left"><span className="flex flex-1 flex-wrap justify-between gap-2 pr-2"><span>{row.cashierName} · {formatDateTimeDO(row.openedAt)}</span><span className="font-normal text-muted-foreground">{row.status === "CLOSED" ? `Efectivo contado: ${formatRD(row.countedClosingCents ?? 0)} · Diferencia: ${formatRD(row.closingDifferenceCents ?? 0)}` : "En curso"}</span></span></AccordionTrigger><AccordionContent>
    {selected?.id === row.id && selected.status === "CLOSED" && <Card className="bg-muted/20"><CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="space-y-1"><CardTitle className="text-lg">Cierre de {selected.cashierName}</CardTitle><p className="text-sm text-muted-foreground">Abrió: {formatDateTimeDO(selected.openedAt)} · Cerró: {selected.closedAt ? formatDateTimeDO(selected.closedAt) : "No disponible"}</p></div><Button className="w-full shrink-0 sm:w-auto print:hidden" variant="outline" onClick={() => { const url = `/receipts/cash-shift/${encodeURIComponent(selected.id)}?autoprint=1`; const popup = window.open(url, "_blank"); if (!popup || popup.closed) window.location.href = url }}><Printer className="mr-2 h-4 w-4" aria-hidden="true" />Imprimir comprobante</Button></CardHeader><CardContent className="grid gap-6 text-sm">
      <section aria-label="Resultado del efectivo" className="rounded-xl border bg-background p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Resultado del efectivo</h3><p className="mt-1 text-muted-foreground">Comparación al cerrar el turno</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${selected.closingDifferenceCents === 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{selected.closingDifferenceCents === null ? "Diferencia no disponible" : selected.closingDifferenceCents === 0 ? "Sin diferencia" : selected.closingDifferenceCents > 0 ? "Sobrante" : "Faltante"}</span></div><dl className="mt-4 grid gap-4 sm:grid-cols-3"><div><dt className="text-muted-foreground">Efectivo esperado</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{selected.expectedClosingCents === null ? "No disponible" : formatRD(selected.expectedClosingCents)}</dd></div><div><dt className="text-muted-foreground">Efectivo contado</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{selected.countedClosingCents === null ? "No disponible" : formatRD(selected.countedClosingCents)}</dd></div><div><dt className="text-muted-foreground">Diferencia</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{selected.closingDifferenceCents === null ? "No disponible" : formatRD(selected.closingDifferenceCents)}</dd></div></dl><div className="mt-4 border-t pt-3 text-muted-foreground">Fondo al abrir: <strong className="text-foreground">{formatRD(selected.openingCountedCents)}</strong> · Diferencia al abrir: <strong className="text-foreground">{formatRD(selected.openingDifferenceCents)}</strong>{selected.openingNote && <p className="mt-1">Nota de apertura: {selected.openingNote}</p>}{selected.closingNote && <p className="mt-1">Nota de cierre: {selected.closingNote}</p>}</div>{snapshot?.emergency && <p className="mt-3 font-medium">Cierre excepcional realizado por el dueño.</p>}</section>
      {snapshot && <ShiftCollectionsSummary collections={shiftCollectionsByMethod(snapshot.movements)} />}
      {summary && <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground"><span>Ventas al contado: <strong className="text-foreground">{formatRD(summary.cashSalesCents)}</strong></span><span>Ventas a crédito: <strong className="text-foreground">{formatRD(summary.creditSalesCents)}</strong></span><span>Abonos: <strong className="text-foreground">{formatRD(summary.collectionsCents)}</strong></span></div>}
      {snapshot && <section><div className="flex flex-wrap items-baseline justify-between gap-2"><div><h3 className="font-semibold">Movimientos del turno</h3><p className="mt-1 text-muted-foreground">Detalle de las operaciones registradas al cierre.</p></div><span className="text-xs text-muted-foreground">{snapshot.movements.length} movimientos</span></div>{snapshot.movements.length > 0 ? <div className="mt-3 overflow-x-auto rounded-xl border bg-background"><table className="w-full min-w-[500px] text-left"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Referencia</th><th className="px-4 py-3 font-medium">Método</th><th className="px-4 py-3 font-medium">Cuenta</th><th className="px-4 py-3 text-right font-medium">Monto</th></tr></thead><tbody>{snapshot.movements.map((m) => <tr className="border-t" key={m.id}><td className="px-4 py-3 font-medium">{m.reference}</td><td className="px-4 py-3">{m.method ? getPaymentMethodLabel(m.method) : "Tesorería"}</td><td className="px-4 py-3">{m.treasuryAccount?.name ?? "—"}</td><td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatRD(m.amountCents)}</td></tr>)}</tbody></table></div> : <p className="mt-3 rounded-xl border bg-background p-4 text-muted-foreground">No hay movimientos registrados en este turno.</p>}<details className="mt-3 rounded-xl border bg-background p-4"><summary className="cursor-pointer font-medium">Ver movimiento neto por método y cuenta</summary><div className="mt-3 grid gap-2">{snapshotBreakdown(snapshot.movements).map((item, index) => <div className="flex justify-between gap-3" key={index}><span>{item.accountName} · {item.method ? getPaymentMethodLabel(item.method) : "Tesorería"}</span><strong className="whitespace-nowrap tabular-nums">{formatRD(item.totalCents)}</strong></div>)}</div></details></section>}
      {snapshot && snapshot.documents.some(d => ["sale", "payment", "supplierPayment", "purchase", "operatingExpense", "return", "treasuryTransfer"].includes(d.sourceType) && !d.cancelled) && <details className="rounded-xl border bg-background p-4 print:hidden"><summary className="cursor-pointer font-semibold">Corregir una operación</summary><p className="mt-2 text-muted-foreground">Selecciona la operación que necesitas corregir.</p><div className="mt-3 flex flex-wrap gap-2">{snapshot.documents.filter(d => ["sale", "payment", "supplierPayment", "purchase", "operatingExpense", "return", "treasuryTransfer"].includes(d.sourceType) && !d.cancelled).map(d => <Button key={`${d.sourceType}:${d.id}`} variant={correction?.sourceType === d.sourceType && correction.sourceId === d.id ? "secondary" : "outline"} size="sm" onClick={() => { setCorrection({ sourceType: d.sourceType, sourceId: d.id }); setCorrectionReason(""); setMoneyMoved(true) }}>{d.reference}</Button>)}</div>
      {correction && <div className="mt-4 grid gap-3 rounded-xl border bg-muted/30 p-4"><p className="font-medium">Corrección: {snapshot.documents.find(d => d.sourceType === correction.sourceType && d.id === correction.sourceId)?.reference}</p><p className="text-muted-foreground">El cierre conservará sus importes. La corrección queda relacionada con la operación original.</p><Label htmlFor="cash-correction-reason">Motivo</Label><Input id="cash-correction-reason" value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} /><label className="flex items-center gap-2"><input type="checkbox" checked={moneyMoved} onChange={e => setMoneyMoved(e.target.checked)} />Hubo devolución o recuperación real del dinero</label><p className="text-muted-foreground">Si hubo efectivo, debe registrarlo el responsable desde su turno abierto.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => run(async () => { await post({ action: "correct", ...correction, reason: correctionReason, moneyMoved }); setCorrection(undefined); setCorrectionReason("") })}>Confirmar reverso</Button><Button variant="outline" disabled={busy} onClick={() => setCorrection(undefined)}>Cancelar</Button></div></div>}</details>}
    </CardContent></Card>}{row.status !== "CLOSED" && <p className="text-muted-foreground">El comprobante estará disponible cuando se cierre el turno.</p>}</AccordionContent></AccordionItem>)}
      </Accordion>
      <nav aria-label="Páginas del historial" className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">Página {historyPage + 1}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy || historyPage === 0} onClick={() => { setHistoryPage(page => page - 1); setSelected(undefined) }}>Anterior</Button><Button variant="outline" size="sm" disabled={busy || ((historyPage + 1) * HISTORY_PAGE_SIZE >= history.length && !hasMoreHistory)} onClick={() => void run(async () => {
        if ((historyPage + 1) * HISTORY_PAGE_SIZE < history.length) { setHistoryPage(page => page + 1); setSelected(undefined); return }
        const rows: History = await read(`history&before=${encodeURIComponent(history[history.length - 1].id)}&limit=${HISTORY_PAGE_SIZE + 1}`)
        setHistory(previous => [...previous, ...rows.slice(0, HISTORY_PAGE_SIZE)]); setHasMoreHistory(rows.length > HISTORY_PAGE_SIZE)
        if (rows.length > 0) { setHistoryPage(page => page + 1); setSelected(undefined) }
      }, false)}>Siguiente</Button></div></nav>
    </AccordionContent></AccordionItem></Accordion></CardContent></Card>}
  </section>
}
