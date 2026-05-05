"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useEffect, useCallback } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const BUSINESS_TZ_OFFSET_MS = -4 * 60 * 60 * 1000

function toBusinessDateInputValue(d: Date) {
  const shifted = new Date(d.getTime() + BUSINESS_TZ_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function ReportDateRangeFilter({ basePath, defaultLastDays }: { basePath: string; defaultLastDays?: number }) {
  const router = useRouter()
  const sp = useSearchParams()
  const hasDefaultRange = defaultLastDays !== undefined

  const buildUrl = useCallback((nextFrom: string, nextTo: string) => {
    const params = new URLSearchParams(sp.toString())
    params.set("from", nextFrom)
    params.set("to", nextTo)
    return `${basePath}?${params.toString()}`
  }, [basePath, sp])

  const getDefaultDates = () => {
    if (hasDefaultRange) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - (defaultLastDays ?? 0))
      return {
        from: toBusinessDateInputValue(from),
        to: toBusinessDateInputValue(to),
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
    if (hasDefaultRange && !sp.get("from") && !sp.get("to")) {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - (defaultLastDays ?? 0))
      const fromStr = toBusinessDateInputValue(from)
      const toStr = toBusinessDateInputValue(to)
      router.replace(buildUrl(fromStr, toStr))
    }
  }, [hasDefaultRange, defaultLastDays, router, buildUrl, sp])

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <div className="text-xs text-muted-foreground">Desde</div>
        <Input type="date" value={from} onChange={(e) => router.replace(buildUrl(e.target.value, to))} />
      </div>
      <div className="grid gap-1">
        <div className="text-xs text-muted-foreground">Hasta</div>
        <Input type="date" value={to} onChange={(e) => router.replace(buildUrl(from, e.target.value))} />
      </div>
      <Button variant="secondary" type="button" disabled={!canApply} onClick={() => router.replace(buildUrl(from, to))}>
        Aplicar
      </Button>
    </div>
  )
}
