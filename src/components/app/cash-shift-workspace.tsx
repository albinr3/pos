"use client"

import { useState } from "react"
import { ArrowDownLeft, ArrowRight, Banknote, Check, CheckCircle2, ChevronDown, CircleAlert, Clock3, RefreshCw, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PriceInput } from "@/components/app/price-input"
import type { CashContext } from "@/lib/cash-offline"
import { formatRD } from "@/lib/money"
import { formatDateTimeDO } from "@/lib/date-time"
import { getPaymentMethodLabel } from "@/lib/payment-methods"

type Actions = Record<"open" | "prepare" | "sync" | "close" | "resume" | "emergency" | "refresh" | "disable", () => void>
type CountProps = { counted: number; note: string; onCountChange: (value: number) => void; onNoteChange: (value: string) => void }
type Props = CountProps & { context: CashContext; busy: boolean; pendingCount: number; manualPending: boolean; actions: Actions }

function CashCount({ counted, note, onCountChange, onNoteChange, expected, busy, mode, ready = true, onSubmit }: CountProps & { expected: number; busy: boolean; mode: "open" | "close" | "emergency"; ready?: boolean; onSubmit: () => void }) {
  const [entered, setEntered] = useState(false)
  const difference = counted - expected
  const needsReason = difference !== 0 || mode === "emergency"
  const canSubmit = !busy && ready && entered && (!needsReason || Boolean(note.trim()))
  return <form className="grid gap-4 rounded-2xl border bg-background p-4 sm:p-5" onSubmit={event => { event.preventDefault(); if (canSubmit) onSubmit() }}>
    <div className="flex items-start gap-3">
      <span className="rounded-xl bg-purple-primary/10 p-2 text-purple-primary dark:text-purple-300"><Banknote className="h-5 w-5" aria-hidden="true" /></span>
      <div><h3 className="font-semibold">{mode === "open" ? "Cuenta el dinero que recibes" : mode === "close" ? "Cuenta lo que vas a entregar" : "Cuenta la caja antes de cerrar"}</h3><p className="mt-1 text-sm text-muted-foreground">Cuenta solo billetes y monedas. Los pagos con tarjeta o transferencia van por separado.</p></div>
    </div>
    <div className="grid gap-2">
      <Label htmlFor="cash-shift-counted">¿Cuánto efectivo {mode === "open" ? "recibes" : "hay en la caja"}?</Label>
      <PriceInput id="cash-shift-counted" valueCents={counted} onChangeCents={value => { onCountChange(value); setEntered(true) }} disabled={busy} maxCents={2147483647} className="h-14 rounded-xl text-2xl font-semibold tabular-nums md:text-2xl" />
      <p className="text-xs text-muted-foreground">Escribe el total que contaste. Usa 0 solo si la caja está vacía.</p>
    </div>
    {/* El cero inicial no es un conteo: no mostrar un faltante antes de que el cajero escriba su monto. */}
    <div aria-live="polite" className={`rounded-xl p-3 text-sm ${!entered ? "bg-muted/50 text-muted-foreground" : difference === 0 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"}`}>
      {!entered ? "Cuando escribas tu conteo, te mostraremos si coincide con el efectivo esperado." : difference === 0 ? <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /><span><strong>¡Tu caja cuadra!</strong> El conteo coincide con lo esperado.</span></div> : <><p className="font-semibold">{difference < 0 ? "Faltan" : "Sobran"} {formatRD(Math.abs(difference))}</p><p className="mt-1">Revisa el conteo una vez más. Si el monto es correcto, explica la diferencia para continuar.</p></>}
    </div>
    {(mode === "emergency" || entered && needsReason) && <div className="grid gap-2"><Label htmlFor="cash-count-note">{mode === "emergency" ? "¿Por qué debe cerrarse sin el responsable?" : "¿Por qué hay una diferencia?"}</Label><Input id="cash-count-note" value={note} onChange={event => onNoteChange(event.target.value)} disabled={busy} placeholder="Describe lo que ocurrió" /><p className="text-xs text-muted-foreground">El motivo quedará guardado junto con este {mode === "open" ? "conteo de apertura" : "cierre"}.</p></div>}
    <Button type="submit" className="h-11 rounded-xl sm:w-fit" variant={mode === "emergency" ? "destructive" : "default"} disabled={!canSubmit}>{busy ? "Guardando…" : mode === "open" ? "Abrir mi turno" : mode === "emergency" ? "Confirmar cierre excepcional" : "Confirmar cierre y entregar caja"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
    {mode === "close" && <p className="text-xs text-muted-foreground">Al confirmar se guarda el comprobante y el siguiente empleado puede abrir su turno.</p>}
  </form>
}

export function CashShiftWorkspace({ context, busy, pendingCount, manualPending, actions, ...count }: Props) {
  const shift = context.activeShift
  const owns = Boolean(shift?.isMine && shift.isDevice)
  const expected = shift ? shift.expectedCashCents : context.expectedOpeningCents
  const canRead = expected !== null && expected !== undefined
  const opening = shift?.openingCountedCents
  const net = canRead && opening != null ? expected - opening : 0
  const closing = shift?.status === "CLOSING"
  const synced = pendingCount === 0 && !manualPending && shift?.lastSequence === shift?.finalSequence
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-purple-primary/10 p-2.5 text-purple-primary dark:text-purple-300"><Wallet className="h-6 w-6" aria-hidden="true" /></span><div><h3 className="text-lg font-semibold">{!shift ? "Empieza tu turno" : owns ? closing ? "Vamos a cerrar tu caja" : "Tu caja está abierta" : `Caja de ${shift.cashierName}`}</h3><p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">{shift ? <><span>{shift.cashierName}</span><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Desde {formatDateTimeDO(shift.openedAt)}</span></> : "Confirma el efectivo que recibes antes de empezar a vender o cobrar."}</p></div></div>
      <div className="flex items-center gap-2">{shift && <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${closing ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"}`}><span className={`h-1.5 w-1.5 rounded-full ${closing ? "bg-amber-500" : "bg-emerald-500"}`} />{closing ? "Cierre en curso" : "En curso"}</span>}<Button size="sm" variant="ghost" disabled={busy} onClick={actions.refresh}><RefreshCw className={`h-4 w-4 ${busy ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />Actualizar</Button></div>
    </div>

    {canRead && <div className={`grid gap-3 ${shift && !closing ? "grid-cols-2 lg:grid-cols-3" : ""}`}>
      <div className={`grid content-center gap-2 rounded-2xl border border-purple-primary/15 bg-purple-primary/5 p-5 ${shift && !closing ? "col-span-2 lg:col-span-1" : ""}`}><p className="text-sm font-medium">{shift ? "Lo que debe haber en efectivo" : "Efectivo esperado al recibir"}</p><p className="break-words text-3xl font-bold tracking-tight text-purple-primary tabular-nums dark:text-purple-300 sm:text-4xl">{formatRD(expected)}</p>{!closing && <p className="text-xs text-muted-foreground">{shift ? "Este es el dinero físico que deberías tener ahora en la caja." : "Compara este monto con los billetes y monedas que recibes."}</p>}</div>
      {shift && !closing && opening != null && <>
        <div className="grid min-w-0 content-center gap-2 rounded-2xl border p-4 sm:p-5"><p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowDownLeft className="h-4 w-4 shrink-0" aria-hidden="true" />Recibiste al abrir</p><p className="break-words text-xl font-semibold tabular-nums sm:text-2xl">{formatRD(opening)}</p><p className="text-xs text-muted-foreground">El efectivo con el que comenzaste este turno.</p></div>
        <div className="grid min-w-0 content-center gap-2 rounded-2xl border p-4 sm:p-5"><p className="text-sm text-muted-foreground">Movimiento de efectivo del turno</p><p className="break-words text-xl font-semibold tabular-nums sm:text-2xl">{net > 0 ? "+" : ""}{formatRD(net)}</p><p className="text-xs text-muted-foreground">Entradas menos salidas, sin incluir el dinero que recibiste al abrir.</p></div>
      </>}
    </div>}

    {shift && !owns && <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /><p>{shift.isMine ? "Este turno se abrió en otro dispositivo. Usa ese dispositivo para registrar movimientos o cerrar la caja." : `El responsable de este turno es ${shift.cashierName}. Debe cerrarlo y entregar el efectivo antes de que puedas abrir el tuyo.`}</p></div>}

    {owns && !closing && <div className="flex flex-col justify-between gap-4 rounded-2xl border border-purple-primary/15 p-4 sm:flex-row sm:items-center sm:p-5"><div><h3 className="font-semibold">¿Terminaste tu turno?</h3><p className="mt-1 max-w-xl text-sm text-muted-foreground">Empieza el cierre para guardar los pendientes y contar el dinero que vas a entregar. Las nuevas ventas de este turno se pausarán.</p>{manualPending && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Confirma el movimiento pendiente que aparece abajo antes de cerrar.</p>}</div><Button className="h-11 shrink-0 rounded-xl" disabled={busy || manualPending} onClick={actions.prepare}>Cerrar mi turno<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button></div>}

    {owns && closing && <div className="grid gap-4">
      <ol className="grid grid-cols-3 gap-2" aria-label="Pasos para cerrar la caja">{[synced ? "Pendientes guardados" : "Guarda los pendientes", "Cuenta el efectivo", "Confirma y entrega"].map((step, index) => <li key={index} className={`flex flex-col items-start gap-2 rounded-xl px-3 py-3 text-xs sm:flex-row sm:items-center sm:text-sm ${index === 0 && synced ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : index === (synced ? 1 : 0) ? "bg-purple-primary/10 font-medium text-purple-primary dark:text-purple-300" : "bg-muted/40 text-muted-foreground"}`}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">{index === 0 && synced ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}</span>{step}</li>)}</ol>
      {!synced && <div role="status" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><p className="font-medium">{pendingCount === 1 ? "Falta 1 operación por enviar" : pendingCount > 0 ? `Faltan ${pendingCount} operaciones por enviar` : "Todavía hay movimientos por confirmar"}</p><p>Guarda todos los pendientes antes de entregar la caja. Necesitas conexión para completar este paso.</p><Button className="w-fit" variant="outline" disabled={busy} onClick={actions.sync}>Enviar pendientes</Button></div>}
      <CashCount {...count} expected={expected ?? 0} busy={busy} mode="close" ready={synced} onSubmit={actions.close} />
      <Button className="justify-self-start" variant="ghost" disabled={busy} onClick={actions.resume}>Volver al turno y seguir trabajando</Button>
    </div>}

    {!shift && context.canOperate && <CashCount {...count} expected={expected ?? 0} busy={busy} mode="open" onSubmit={actions.open} />}
    {!shift && !context.canOperate && <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">No hay un turno abierto. Para abrir el tuyo, solicita al dueño el permiso de operar la caja.</p>}

    {context.breakdown.length > 0 && <details className="group rounded-xl border"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium">Ver detalle por cuenta y forma de pago<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><div className="grid gap-2 border-t px-4 py-3 text-sm">{closing && opening != null && <p className="rounded-lg bg-muted/40 p-3">Recibiste {formatRD(opening)} al abrir. El movimiento de efectivo del turno fue de {formatRD(net)}.</p>}<p className="mb-1 text-xs text-muted-foreground">Entradas menos salidas de este turno. Las tarjetas y transferencias no forman parte del efectivo que debes contar.</p>{context.breakdown.map((item, index) => <div key={index} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"><span>{item.accountName} · {item.method ? getPaymentMethodLabel(item.method) : "Entradas y salidas de dinero"}</span><strong className="tabular-nums">{formatRD(item.totalCents)}</strong></div>)}</div></details>}

    {(context.canManage && !shift || context.isOwner && shift && !owns) && <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Opciones del dueño</summary><div className="mt-4 grid gap-3">
      {!shift && context.canManage && <><p className="text-sm text-muted-foreground">Desactivar el control permite volver a trabajar sin abrir turnos. Los cierres anteriores se conservan.</p><Button className="w-fit" variant="outline" disabled={busy} onClick={actions.disable}>Desactivar control por turnos</Button></>}
      {shift && context.isOwner && !owns && <><p className="text-sm text-muted-foreground">Usa el cierre excepcional solo si el responsable no puede cerrar su turno. Debes contar el efectivo y explicar el motivo.</p><CashCount {...count} expected={expected ?? 0} busy={busy} mode="emergency" onSubmit={actions.emergency} /></>}
    </div></details>}
  </div>
}
