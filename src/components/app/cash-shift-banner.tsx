"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { cachedCashContext, cashPending, refreshCashContext, type CashContext } from "@/lib/cash-offline"
import { formatRD } from "@/lib/money"
import { CashShiftDayNotice } from "@/components/app/cash-shift-day-notice"
import { ShiftReportButton } from "@/components/app/shift-report-button"
import { useOnlineStatus } from "@/hooks/use-online-status"

export function CashShiftBanner({ actor }: { actor?: { id: string; accountId: string } }) {
  const [context, setContext] = useState<CashContext>()
  const [pending, setPending] = useState(0)
  const isOnline = useOnlineStatus()
  const actorId = actor?.id, actorAccountId = actor?.accountId
  useEffect(() => {
    let live = true
    const refresh = async () => {
      const state = await refreshCashContext().catch(() => cachedCashContext())
      if (live) {
        // Nunca mostrar un turno cacheado al cambiar de empleado o negocio.
        if (actorId && (state?.userId !== actorId || state?.accountId !== actorAccountId)) { setContext(undefined); setPending(0); return }
        setContext(state)
        const rows = await cashPending()
        setPending(rows.filter(r => r.cashOperation.accountId === state?.accountId).length)
      }
    }
    void refresh().catch(() => {})
    const listener = () => { void refresh().catch(() => {}) }
    window.addEventListener("focus", listener)
    window.addEventListener("online", listener)
    window.addEventListener("cash-outbox-changed", listener)
    window.addEventListener("cash-shift-changed", listener)
    return () => { live = false; window.removeEventListener("focus", listener); window.removeEventListener("online", listener); window.removeEventListener("cash-outbox-changed", listener); window.removeEventListener("cash-shift-changed", listener) }
  }, [actorId, actorAccountId])
  if (!context?.enabled) return pending > 0 ? <div className="col-span-full rounded-md border border-amber-400 p-3 text-sm" role="status">{pending} operación(es) pendiente(s) de sincronización. <Link className="font-medium underline" href="/daily-close">Revisar pendientes</Link></div> : null
  const shift = context.activeShift
  return <div className="col-span-full rounded-md border bg-muted/40 p-3 text-sm" role="status">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span>{shift ? `Caja de ${shift.cashierName} · ${shift.status === "OPEN" ? "Turno abierto" : "Cierre en preparación"}` : "Abre tu turno antes de vender o cobrar"}</span>
      <Link className="font-medium underline" href="/daily-close">Ir a caja</Link>
    </div>
    {shift?.expectedCashCents !== null && shift?.expectedCashCents !== undefined && <p>Efectivo esperado: {formatRD(shift.expectedCashCents)}</p>}
    {pending > 0 && <p className="text-amber-700 dark:text-amber-400">{pending} operación(es) pendiente(s). Sincroniza antes de cerrar o entregar.</p>}
    {!isOnline && actor && shift?.isMine && shift.isDevice && <div className="mt-2 grid justify-items-start gap-1"><p>Sin conexión puedes imprimir un detalle provisional. Este reporte no confirma el cierre.</p><ShiftReportButton context={context} actor={actor} /></div>}
    {shift && <CashShiftDayNotice openedAt={shift.openedAt} closing={shift.status === "CLOSING"} compact />}
  </div>
}
