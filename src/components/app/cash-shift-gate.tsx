"use client"

import Link from "next/link"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/app/price-input"
import { CashShiftIllustration } from "@/components/app/cash-shift-illustration"
import { CashShiftDayNotice } from "@/components/app/cash-shift-day-notice"
import { assertCashShiftAccess, CashShiftAccessError, resolveCashContext, type CashActorIdentity, type CashContext } from "@/lib/cash-offline"
import { openCashShiftFromClient } from "@/lib/cash-shift-opening"
import { formatRD } from "@/lib/money"

type Access = { allowed: boolean; ensureAccess: () => Promise<boolean>; handleError: (error: unknown) => boolean }
type GateState = { status: "checking" | "ready" | "blocked"; context?: CashContext; message?: string }
const CashAccess = createContext<Access | null>(null)

export function useCashShiftAccess() {
  const access = useContext(CashAccess)
  if (!access) throw new Error("La pantalla de ventas o cobros requiere la protección de turno de caja")
  return access
}

export function CashShiftGate({ actor, bypass = false, children }: { actor: CashActorIdentity; bypass?: boolean; children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "checking" })
  const [hadAccess, setHadAccess] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [counted, setCounted] = useState(0)
  const [note, setNote] = useState("")
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine)
  const requestVersion = useRef(0)
  const invalidateRequests = useCallback(() => { requestVersion.current++ }, [])
  const identity = useMemo(() => ({ id: actor.id, accountId: actor.accountId }), [actor.id, actor.accountId])

  const handleError = useCallback((error: unknown) => {
    if (!(error instanceof CashShiftAccessError)) return false
    requestVersion.current++
    setState({ status: "blocked", context: error.context, message: error.message })
    setDialogOpen(true)
    return true
  }, [])

  const check = useCallback(async () => {
    if (bypass) return true
    const version = ++requestVersion.current
    try {
      const { context } = await resolveCashContext(identity)
      assertCashShiftAccess(context, identity)
      if (version === requestVersion.current) {
        setState({ status: "ready", context }); setHadAccess(true); setDialogOpen(false)
      }
      return true
    } catch (error) {
      if (version === requestVersion.current) {
        setState({ status: "blocked", context: error instanceof CashShiftAccessError ? error.context : undefined, message: error instanceof Error ? error.message : "No se pudo comprobar el turno. Inténtalo de nuevo." })
        setDialogOpen(true)
      }
      return false
    }
  }, [bypass, identity])

  useEffect(() => {
    void check()
    const refresh = () => { setOnline(navigator.onLine); void check() }
    window.addEventListener("focus", refresh)
    window.addEventListener("online", refresh)
    window.addEventListener("offline", refresh)
    window.addEventListener("cash-shift-changed", refresh)
    return () => {
      invalidateRequests()
      window.removeEventListener("focus", refresh)
      window.removeEventListener("online", refresh)
      window.removeEventListener("offline", refresh)
      window.removeEventListener("cash-shift-changed", refresh)
    }
  }, [check, invalidateRequests])

  async function openShift() {
    if (busy) return
    setBusy(true); setFormError("")
    try {
      const context = await openCashShiftFromClient(identity, counted, note)
      requestVersion.current++
      setState({ status: "ready", context }); setHadAccess(true); setDialogOpen(false)
      setCounted(0); setNote("")
    } catch (error) {
      await check()
      setFormError(error instanceof Error ? error.message : "No se pudo abrir el turno")
    } finally { setBusy(false) }
  }

  const allowed = bypass || state.status === "ready"
  const context = state.context
  const canOpen = Boolean(context?.enabled && context.canOperate && !context.activeShift)
  const canVisitCash = Boolean(context && (context.canOperate || context.canViewAll || context.canManage))
  const expected = context?.expectedOpeningCents ?? 0
  const difference = counted - expected
  const access = useMemo(() => ({ allowed, ensureAccess: check, handleError }), [allowed, check, handleError])

  return <CashAccess.Provider value={access}>
    {/* No montar el formulario antes de verificar el turno. Después, ocultarlo conserva el carrito y los abonos preparados. */}
    {(allowed || hadAccess) && <div hidden={!allowed} inert={!allowed}>{children}</div>}
    {!allowed && <div className="grid gap-3 rounded-md border p-4" role="status">
      {state.status === "checking" ? <p>Comprobando tu turno de caja…</p> : <>
        <p>Necesitas resolver el acceso a la caja antes de facturar o cobrar.</p>
        <div className="flex flex-wrap gap-2"><Button onClick={() => { setFormError(""); setDialogOpen(true) }}>Abrir o revisar mi turno</Button><Button variant="outline" onClick={() => void check()}>Comprobar de nuevo</Button>{canVisitCash && <Button asChild variant="ghost"><Link href="/daily-close">Ir a Cuadre diario</Link></Button>}</div>
      </>}
    </div>}
    <Dialog open={!allowed && dialogOpen} onOpenChange={open => { if (!busy) setDialogOpen(open) }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-2xl border-purple-primary/10 sm:max-w-lg sm:rounded-2xl">
        <DialogHeader className="items-center gap-2 text-center sm:text-center">
          {canOpen && <CashShiftIllustration />}
          <DialogTitle className="text-xl">{canOpen ? "Abre tu turno para comenzar" : "Revisa tu turno de caja"}</DialogTitle>
          <DialogDescription className="max-w-sm leading-relaxed">{state.message}</DialogDescription>
        </DialogHeader>
        {context?.enabled && context.activeShift && <CashShiftDayNotice openedAt={context.activeShift.openedAt} closing={context.activeShift.status === "CLOSING"} compact />}
        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
        {canOpen && <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void openShift() }}>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-primary/10 bg-purple-primary/5 px-4 py-3">
            <div><p className="text-xs text-muted-foreground">Responsable</p><p className="text-sm font-medium">{context?.userName}</p></div>
            <div className="text-right"><p className="text-xs text-muted-foreground">Efectivo esperado</p><p className="text-lg font-semibold tabular-nums text-purple-primary dark:text-purple-300">{formatRD(expected)}</p></div>
          </div>
          <Label htmlFor="cash-gate-counted">¿Cuánto efectivo recibes en la caja?</Label>
          <PriceInput id="cash-gate-counted" valueCents={counted} onChangeCents={setCounted} maxCents={2147483647} disabled={busy} />
          <p className="text-sm text-muted-foreground">Cuenta los billetes y monedas y escribe el total real. Introduce 0 solo si la caja está vacía.</p>
          <p className="text-sm" aria-live="polite">{difference === 0 ? "El conteo coincide con el efectivo esperado." : <>Diferencia: <strong>{formatRD(Math.abs(difference))} {difference < 0 ? "menos" : "más"}</strong> que el esperado.</>}</p>
          <Label htmlFor="cash-gate-note">Motivo de la diferencia {difference !== 0 ? "(obligatorio)" : "(opcional)"}</Label>
          <Input id="cash-gate-note" value={note} onChange={event => setNote(event.target.value)} disabled={busy} />
          {!online && <p role="alert" className="text-sm text-destructive">Necesitas conexión para abrir tu turno.</p>}
          <Button type="submit" className="h-11 rounded-xl" disabled={busy || !online || difference !== 0 && !note.trim()}>{busy ? "Abriendo turno…" : "Abrir mi turno y comenzar"}</Button>
        </form>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDialogOpen(false)}>Ahora no</Button>{!canOpen && <Button disabled={busy} onClick={() => void check()}>Comprobar de nuevo</Button>}{canVisitCash && <Button asChild variant="ghost"><Link href="/daily-close">Ir a Cuadre diario</Link></Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  </CashAccess.Provider>
}
