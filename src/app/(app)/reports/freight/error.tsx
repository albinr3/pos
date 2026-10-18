"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function FreightReportError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="grid gap-4 rounded-md border p-6">
      <h1 className="text-xl font-semibold">No se pudo cargar el reporte de fletes</h1>
      <p className="text-sm text-muted-foreground">Intenta nuevamente para recuperar los filtros y las facturas.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Volver a intentar</Button>
        <Button asChild variant="outline"><Link href="/reports">Volver a Reportes</Link></Button>
      </div>
    </div>
  )
}
