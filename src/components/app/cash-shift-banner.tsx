"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { cachedCashContext, cashPending, refreshCashContext, type CashContext } from "@/lib/cash-offline"
import { formatRD } from "@/lib/money"

export function CashShiftBanner() {
  const [context, setContext] = useState<CashContext>()
  const [pending, setPending] = useState(0)
  useEffect(() => {
    let live = true
    const refresh = async () => {
      const state = await refreshCashContext().catch(() => cachedCashContext())
      if (live) {
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
  }, [])
  if (!context?.enabled) return null
  const shift = context.activeShift
  return <div className="col-span-full rounded-md border bg-muted/40 p-3 text-sm" role="status">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span>{shift ? `Caja de ${shift.cashierName} · ${shift.status === "OPEN" ? "Turno abierto" : "Cierre en preparación"}` : "Abre tu turno antes de vender o cobrar"}</span>
      <Link className="font-medium underline" href="/daily-close">Ir a caja</Link>
    </div>
    {shift?.expectedCashCents !== null && shift?.expectedCashCents !== undefined && <p>Efectivo esperado: {formatRD(shift.expectedCashCents)}</p>}
    {pending > 0 && <p className="text-amber-700 dark:text-amber-400">{pending} operación(es) pendiente(s). Sincroniza antes de cerrar o entregar.</p>}
  </div>
}
