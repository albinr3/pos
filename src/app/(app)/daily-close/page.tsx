import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatRD } from "@/lib/money"

import { getDailyClose } from "./actions"

import { DateRangeFilter } from "./filter-client"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function DailyClosePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const data = await getDailyClose({ from: sp.from, to: sp.to })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuadre diario</h1>
          <p className="text-sm text-muted-foreground">Resumen de lo vendido y lo cobrado del día o por rango.</p>
        </div>
        <DateRangeFilter basePath="/daily-close" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Vendido hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(data.soldTotal)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{data.salesCount} facturas</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Vendido contado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(data.soldCash)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Vendido crédito</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(data.soldCredit)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Cobrado hoy (abonos)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(data.collectedTotal)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{data.paymentsCount} pagos</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle de cobros por método</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {Object.keys(data.collectedByMethod).length === 0 ? (
            <div className="text-muted-foreground">No hay cobros registrados hoy.</div>
          ) : (
            Object.entries(data.collectedByMethod).map(([method, cents]) => (
              <div key={method} className="flex items-center justify-between rounded-md border p-3">
                <span className="font-medium">{method}</span>
                <span className="font-semibold">{formatRD(cents)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
