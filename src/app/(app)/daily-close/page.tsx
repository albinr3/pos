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
            <div className="text-2xl font-semibold">{formatRD(data.soldTotalNetCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{data.salesCount} facturas</div>
            <div className="mt-1 text-xs text-muted-foreground">Bruto: {formatRD(data.soldTotal)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Vendido contado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(data.soldCashNetCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Bruto: {formatRD(data.soldCash)}</div>
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
          <CardTitle className="text-sm text-muted-foreground">Devoluciones contado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold text-red-600">-{formatRD(data.cashReturnsTotalCents)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Descontadas por fecha de devolución para el neto del período
          </div>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>Ventas al contado por método</CardTitle>
        </CardHeader>
        <CardContent>
          <details className="group rounded-md border">
            <summary className="cursor-pointer list-none rounded-md px-4 py-3 font-medium transition hover:bg-muted/50">
              <div className="flex items-center justify-between gap-4">
                <span>Resumen de ventas por método de pago</span>
                <span className="text-sm text-muted-foreground">
                  {formatRD(data.cashSalesSummary.totalCents)} · {data.cashSalesSummary.salesCount} ventas
                </span>
              </div>
            </summary>

            <div className="grid gap-3 border-t p-4 text-sm">
              {data.cashSalesSummary.byMethod.length === 0 ? (
                <div className="text-muted-foreground">No hay ventas al contado en el rango seleccionado.</div>
              ) : (
                data.cashSalesSummary.byMethod.map((item) => (
                  <div key={item.method} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">{item.label}</span>
                      <span className="font-semibold">{formatRD(item.totalCents)}</span>
                    </div>

                    {item.method === "TRANSFERENCIA" && item.banks.length > 0 ? (
                      <div className="mt-3 grid gap-2 border-t pt-3">
                        {item.banks.map((bank) => (
                          <div key={bank.bankName} className="flex items-center justify-between gap-4 text-muted-foreground">
                            <span>{bank.bankName}</span>
                            <span className="font-medium text-foreground">{formatRD(bank.totalCents)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}
