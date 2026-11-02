"use client"

import { useEffect, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/app/price-input"
import { assertNoCashOpeningPending } from "@/lib/cash-shift-opening"
import { refreshCashContext, type CashContext } from "@/lib/cash-offline"
import { formatRD } from "@/lib/money"
import type { previewCashActivation } from "@/lib/cash-shifts"

type Preview = Awaited<ReturnType<typeof previewCashActivation>>
type Props = { context: CashContext; onActivated: (context: CashContext) => void; onCancel: () => void }

// Ajustes y Cuadre diario comparten la misma revisión para no omitir sus validaciones.
export function CashControlActivation({ context, onActivated, onCancel }: Props) {
  const id = useId()
  const [preview, setPreview] = useState<Preview>()
  const [accountId, setAccountId] = useState(context.treasuryAccountId ?? "")
  const [counted, setCounted] = useState(0)
  const [countEntered, setCountEntered] = useState(false)
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function prepare() {
      try {
        if (!navigator.onLine) throw new Error("Necesitas conexión para activar múltiples turnos")
        await assertNoCashOpeningPending(true)
        const response = await fetch("/api/cash-shifts?view=preview", { cache: "no-store" })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudieron revisar los saldos")
        if (!cancelled) setPreview(result)
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "No se pudieron revisar los saldos")
      }
    }
    void prepare()
    return () => { cancelled = true }
  }, [revision])

  const activationAccount = preview?.accounts.find(account => account.id === accountId)
  const activationDifference = activationAccount ? counted - activationAccount.balanceCents : null

  function complete(next: CashContext) {
    onActivated(next)
    window.dispatchEvent(new Event("cash-shift-changed"))
  }

  async function activate() {
    if (!preview || busy) return
    setBusy(true); setError("")
    let submitted = false
    try {
      if (!navigator.onLine) throw new Error("Necesitas conexión para activar múltiples turnos")
      const before = await refreshCashContext()
      if (before.accountId !== context.accountId || before.userId !== context.userId) throw new Error("El empleado cambió. Recarga la página antes de activar múltiples turnos")
      if (!before.canManage) throw new Error("No tienes permiso para administrar turnos de caja")
      if (before.enabled) { complete(before); return }
      await assertNoCashOpeningPending(true)
      submitted = true
      const response = await fetch("/api/cash-shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate", treasuryAccountId: accountId, countedCents: counted, note, previewToken: preview.previewToken }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo activar múltiples turnos")
      // El POST ya confirmó el cambio permanente; una falla al refrescar no debe ofrecer volver atrás.
      const next = await refreshCashContext().catch(() => ({ ...before, enabled: true, treasuryAccountId: accountId }))
      complete(next)
    } catch (error) {
      // Una respuesta perdida puede ocultar una activación confirmada. Recuperar antes de permitir otro intento.
      const recovered = submitted ? await refreshCashContext().catch(() => null) : null
      if (recovered?.enabled && recovered.accountId === context.accountId && recovered.userId === context.userId) { complete(recovered); return }
      setError(error instanceof Error ? error.message : "No se pudo confirmar la activación")
    } finally { setBusy(false) }
  }

  return <div className="grid gap-3 rounded-md border p-4" aria-label="Activación de múltiples turnos">
    <div className="grid gap-1"><h3 className="font-semibold">Prepara tu caja para trabajar por turnos</h3><p className="text-sm text-muted-foreground">Esta revisión se hace al activar el control. Después, cada empleado abrirá y cerrará su propio turno.</p></div>
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {!preview ? !error && <p className="text-sm text-muted-foreground" role="status">Revisando saldos…</p> : <>
      <p className="text-sm">Las operaciones anteriores a la primera activación conservarán su historial. Como entonces no había turnos registrados, no se asignarán a ninguno.</p>
      {preview.unclassified > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><p className="font-medium">Revisa {preview.unclassified} operación(es) anteriores</p><p>No tienen un movimiento de dinero identificado en una cuenta. Algunas pueden no haber movido dinero; otras pueden no tener una cuenta registrada. Sus importes no se asignan automáticamente, así que revisa los saldos antes de continuar.</p></div>}
      {preview.future > 0 && <p className="text-red-700 dark:text-red-300">Revisa {preview.future} operación(es) con fecha futura antes de activar.</p>}
      <div className="grid gap-1 text-sm"><p className="font-medium">Saldos calculados por el sistema</p><p className="text-muted-foreground">Se basan en los movimientos con cuenta identificada. Compara el saldo de caja con el dinero que tienes físicamente.</p><ul>{preview.accounts.map(a => <li key={a.id}>{a.name}: <strong>{formatRD(a.balanceCents)}</strong></li>)}</ul></div>
      <Label htmlFor={`${id}-account`}>Caja que usarán los empleados</Label>
      <select id={`${id}-account`} disabled={busy} className="w-full min-w-0 rounded-md border bg-background p-2" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Selecciona una caja</option>{preview.accounts.filter(a => a.type === "CAJA" && a.isActive && a.currency === "DOP" && (!context.treasuryAccountId || a.id === context.treasuryAccountId)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      {activationAccount && <p className="text-sm">Para <strong>{activationAccount.name}</strong>, el sistema calcula <strong>{formatRD(activationAccount.balanceCents)}</strong>.</p>}
      <Label htmlFor={`${id}-counted`}>¿Cuánto efectivo hay en la caja?</Label><PriceInput id={`${id}-counted`} disabled={busy} valueCents={counted} onChangeCents={value => { setCounted(value); setCountEntered(true) }} />
      <p className="text-sm text-muted-foreground">Cuenta los billetes y monedas y escribe el total real. {activationAccount && activationAccount.balanceCents >= 0 && <>Si cuentas {formatRD(activationAccount.balanceCents)}, introduce ese mismo monto. </>}Escribe 0 solo si la caja está vacía.</p>
      {countEntered && activationDifference !== null && <p className="text-sm" aria-live="polite">{activationDifference === 0 ? "El efectivo contado coincide con el saldo calculado." : <>Diferencia: <strong>{formatRD(Math.abs(activationDifference))} {activationDifference < 0 ? "menos" : "más"}</strong> que el saldo calculado. Explica el motivo; la diferencia se registrará al activar.</>}</p>}
      <Label htmlFor={`${id}-note`}>Motivo de la diferencia {countEntered && activationDifference !== null && activationDifference !== 0 ? "(obligatorio)" : "(solo si hay diferencia)"}</Label><Input id={`${id}-note`} disabled={busy} value={note} onChange={e => setNote(e.target.value)} />
      <p className="text-sm text-muted-foreground">Antes de activar, sincroniza las ventas y los abonos pendientes de todos los dispositivos. Los turnos se usan desde la web.</p>
      <p className="text-sm font-semibold">Una vez activado, no podrás volver al modo Turno único</p>
      {/* La activación no abre un turno; el empleado debe contar de nuevo el efectivo que recibe. */}
      <Button className="h-auto min-h-10 whitespace-normal" disabled={busy || !context.canManage || !activationAccount || !countEntered || preview.future > 0 || (activationDifference !== 0 && !note.trim())} onClick={() => void activate()}>{busy ? "Activando…" : "Confirmar y activar múltiples turnos"}</Button>
    </>}
    <div className="flex flex-wrap gap-2">
      {error && <Button variant="outline" disabled={busy} onClick={() => { setPreview(undefined); setError(""); setRevision(value => value + 1) }}>Actualizar saldos</Button>}
      <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button>
    </div>
  </div>
}
