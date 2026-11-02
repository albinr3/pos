"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { CashControlActivation } from "@/components/app/cash-control-activation"
import { refreshCashContext, type CashContext } from "@/lib/cash-offline"

export function CashModeSettings() {
  const [context, setContext] = useState<CashContext>()
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const next = await refreshCashContext()
        if (!cancelled) { setContext(next); setError(""); if (next.enabled) setActivating(false) }
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "No se pudo consultar el modo de cuadre")
      }
    }
    void refresh()
    window.addEventListener("cash-shift-changed", refresh)
    window.addEventListener("focus", refresh)
    return () => { cancelled = true; window.removeEventListener("cash-shift-changed", refresh); window.removeEventListener("focus", refresh) }
  }, [revision])

  const multiple = Boolean(context?.enabled || activating)
  return <Card>
    <CardHeader><CardTitle>Cuadre de caja</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      {error && <div role="alert" className="grid justify-items-start gap-2 text-sm"><p className="text-red-700 dark:text-red-300">{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Reintentar</Button></div>}
      {!context ? !error && <p className="text-sm text-muted-foreground">Consultando modo de cuadre…</p> : <>
        <div className="grid gap-2">
          <Label htmlFor="cash-control-mode">Modo de cuadre</Label>
          {/* Múltiples turnos es permanente. El selector prepara la activación; nunca desactiva el control. */}
          <select id="cash-control-mode" className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-70 md:w-[300px]" aria-describedby="cash-control-mode-description cash-control-mode-status" value={multiple ? "multiple" : "single"} disabled={context.enabled || !context.canManage || activating || Boolean(error)} onChange={e => { if (e.target.value === "multiple" && context.canManage && !context.enabled) setActivating(true) }}>
            <option value="single">Turno único</option><option value="multiple">Múltiples turnos</option>
          </select>
          <p id="cash-control-mode-description" className="text-sm text-muted-foreground">{multiple ? "Cada empleado abre y cierra su turno para registrar sus cobros y el efectivo que entrega" : "Un cuadre general del día, sin aperturas y cierres por empleado"}</p>
          <p id="cash-control-mode-status" className="text-sm text-muted-foreground">{context.enabled ? "Este modo está activado de forma permanente" : activating ? "Revisa los saldos y confirma para aplicar el cambio de modo." : !context.canManage ? "Necesitas el permiso de administrar turnos de caja para activar múltiples turnos." : "Al activar Múltiples turnos, no podrás volver al modo Turno único."}</p>
        </div>
        {activating && !context.enabled && <CashControlActivation key={`${context.accountId}:${context.userId}`} context={context} onCancel={() => setActivating(false)} onActivated={next => { setContext(next); setActivating(false) }} />}
      </>}
    </CardContent>
  </Card>
}
