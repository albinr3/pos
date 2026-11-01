import { Banknote, CreditCard, Landmark, Wallet } from "lucide-react"
import type { ShiftCollection } from "@/lib/cash-money"
import { formatRD } from "@/lib/money"
import { getPaymentMethodLabel } from "@/lib/payment-methods"

const icons = { EFECTIVO: Banknote, TARJETA: CreditCard, TRANSFERENCIA: Landmark, OTRO: Wallet }

export function ShiftCollectionsSummary({ collections, compact = false, unavailableMessage = "No hay datos suficientes en este cierre para calcular los cobros." }: { collections?: ShiftCollection[] | null; compact?: boolean; unavailableMessage?: string }) {
  if (!collections) return <section aria-label="Cobros del turno" className={compact ? "my-3 space-y-2 border-y py-3 text-xs" : "rounded-xl border p-4 text-sm"}><h3 className="font-semibold">Cobros del turno</h3><p className={compact ? "" : "mt-1 text-muted-foreground"}>Resumen de cobros no disponible. {unavailableMessage}</p></section>
  const total = collections.reduce((sum, item) => sum + item.totalCents, 0)
  return <section aria-label="Cobros del turno" className={compact ? "my-3 space-y-2 border-y py-3" : "grid gap-3"}>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">Cobros del turno</h3><p className={compact ? "font-bold tabular-nums" : "text-lg font-semibold tabular-nums"}>Total cobrado: {formatRD(total)}</p></div>
    <p className={compact ? "text-xs" : "text-sm text-muted-foreground"}>Ventas y abonos registrados, con sus anulaciones y ajustes. Gastos y devoluciones se muestran en los movimientos.</p>
    <dl className={compact ? "grid gap-2" : "grid gap-3 sm:grid-cols-3"}>
      {collections.map(item => {
        const Icon = icons[item.method]
        const label = item.method === "OTRO" ? "Otros" : getPaymentMethodLabel(item.method)
        return <div key={item.method} className={compact ? "flex items-baseline justify-between gap-2" : "grid min-w-0 content-center gap-3 rounded-2xl border bg-background p-4 sm:p-5"}>
          <dt className={compact ? "" : "inline-flex items-center gap-2 text-sm font-medium"}>{!compact && <Icon className="h-5 w-5 shrink-0 text-purple-primary dark:text-purple-300" aria-hidden="true" />}{label}</dt>
          <dd className={compact ? "font-semibold tabular-nums" : "break-words text-2xl font-semibold tracking-tight tabular-nums"}>{formatRD(item.totalCents)}</dd>
        </div>
      })}
    </dl>
    <p className={compact ? "text-xs" : "text-xs text-muted-foreground"}>Tarjeta y transferencia muestran cobros registrados; no confirman la conciliación bancaria.</p>
  </section>
}
