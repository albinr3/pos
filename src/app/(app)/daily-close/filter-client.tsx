"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function DateRangeFilter({ basePath }: { basePath: string }) {
  const router = useRouter()
  const sp = useSearchParams()

  const from = sp.get("from") ?? ""
  const to = sp.get("to") ?? ""

  const canApply = useMemo(() => Boolean(from && to), [from, to])

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
      <Button
        type="button"
        variant="secondary"
        disabled={!canApply}
        onClick={() => router.replace(`${basePath}?from=${from}&to=${to}`)}
      >
        Aplicar
      </Button>
      <Button type="button" variant="ghost" onClick={() => router.replace(basePath)}>
        Hoy
      </Button>
    </div>
  )
}
