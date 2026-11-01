"use client"

import { useEffect, useState } from "react"
import { Clock3 } from "lucide-react"
import { endOfDay, isBeforeCurrentBusinessDay } from "@/lib/dates"
import { formatDateTimeDO } from "@/lib/date-time"

export function CashShiftDayNotice({ openedAt, closing = false, compact = false }: { openedAt: Date | string; closing?: boolean; compact?: boolean }) {
  const [previousDay, setPreviousDay] = useState(false)

  useEffect(() => {
    let timer: number | undefined
    const update = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      const now = new Date()
      setPreviousDay(isBeforeCurrentBusinessDay(openedAt, now))
      // El aviso también debe aparecer al cambiar el día sin recargar la página.
      timer = window.setTimeout(update, Math.max(1000, endOfDay(now).getTime() - now.getTime() + 1))
    }
    const onVisibilityChange = () => { if (document.visibilityState === "visible") update() }
    update()
    window.addEventListener("focus", update)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => { if (timer !== undefined) window.clearTimeout(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", onVisibilityChange) }
  }, [openedAt])

  // Al cambiar de turno, no reutilizar el estado del anterior mientras se actualiza el efecto.
  if (!previousDay || !isBeforeCurrentBusinessDay(openedAt)) return null
  return <div role="status" className={`flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 ${compact ? "mt-2 p-3 text-xs sm:text-sm" : "p-4 text-sm"}`}>
    <Clock3 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
    <div><p className="font-semibold">Este turno comenzó un día anterior</p><p className="mt-1">Se abrió el {formatDateTimeDO(openedAt)} y {closing ? "sigue en proceso de cierre" : "sigue abierto"}. Los turnos pueden continuar durante la noche; si ya terminó la jornada, revisa los pendientes y coordina el cierre.</p></div>
  </div>
}
