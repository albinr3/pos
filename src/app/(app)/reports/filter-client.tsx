"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useEffect } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ReportDateRangeFilter({ basePath, defaultLastDays }: { basePath: string; defaultLastDays?: number }) {
  const router = useRouter()
  const sp = useSearchParams()

  const getDefaultDates = () => {
    if (defaultLastDays) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - defaultLastDays)
      return {
        from: from.toISOString().split("T")[0],
        to: to.toISOString().split("T")[0],
      }
    }
    return { from: "", to: "" }
  }

  const defaultDates = getDefaultDates()
  const from = sp.get("from") ?? defaultDates.from
  const to = sp.get("to") ?? defaultDates.to

  const canApply = useMemo(() => Boolean(from && to), [from, to])

  // Si no hay parámetros y hay un defaultLastDays, establecer los valores por defecto
  useEffect(() => {
    if (defaultLastDays && !sp.get("from") && !sp.get("to")) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - defaultLastDays)
      const fromStr = from.toISOString().split("T")[0]
      const toStr = to.toISOString().split("T")[0]
      router.replace(`${basePath}?from=${fromStr}&to=${toStr}`)
    }
  }, [defaultLastDays, basePath, router, sp])

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <div className="text-xs text-muted-foreground">Desde</div>
        <Input type="date" value={from} onChange={(e) => router.replace(`${basePath}?from=${e.target.value}&to=${to}`)} />
      </div>
      <div className="grid gap-1">
        <div className="text-xs text-muted-foreground">Hasta</div>
        <Input type="date" value={to} onChange={(e) => router.replace(`${basePath}?from=${from}&to=${e.target.value}`)} />
      </div>
      <Button variant="secondary" type="button" disabled={!canApply} onClick={() => router.replace(`${basePath}?from=${from}&to=${to}`)}>
        Aplicar
      </Button>
    </div>
  )
}
