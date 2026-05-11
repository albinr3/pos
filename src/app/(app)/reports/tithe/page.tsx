import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { DownloadPdfButton } from "@/components/app/download-pdf-button"
import { getCurrentUser } from "@/lib/auth"
import { formatDateDO } from "@/lib/date-time"
import { formatRD } from "@/lib/money"
import { redirect } from "next/navigation"

import { getTitheReport } from "../actions"
import { ReportDateRangeFilter } from "../filter-client"

const TITHE_REPORT_ALLOWED_EMAIL = "albinmrodriguez@gmail.com"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function TitheReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const userEmail = (user.email ?? "").trim().toLowerCase()
  if (userEmail !== TITHE_REPORT_ALLOWED_EMAIL) {
    redirect("/reports")
  }

  const sp = await searchParams
  const data = await getTitheReport({
    from: sp.from || undefined,
    to: sp.to || undefined,
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reporte de Diezmo</h1>
          <p className="text-sm text-muted-foreground">
            Utilidad operativa de lo ya cobrado (antes de deducir ITBIS).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DownloadPdfButton />
          <ReportDateRangeFilter basePath="/reports/tithe" defaultLastDays={30} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Base Para Diezmo</CardTitle>
          <div className="mt-2 text-xs text-muted-foreground">
            Período: {formatDateDO(data.from)} - {formatDateDO(data.to)}
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-3">
            <div className="text-base font-semibold">Cobrado Real En El Período</div>
            <div className="grid gap-2 pl-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Facturas contado cobradas</div>
                  <div className="text-xs text-muted-foreground">{data.cashSalesCount} facturas</div>
                </div>
                <div className="text-base font-medium">{formatRD(data.cashSalesTotalCents)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Recibos de pago a crédito</div>
                  <div className="text-xs text-muted-foreground">{data.creditPaymentsCount} pagos</div>
                </div>
                <div className="text-base font-medium">{formatRD(data.creditPaymentsTotalCents)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Devoluciones de contado</div>
                  <div className="text-xs text-muted-foreground">{data.cashReturnsCount} devoluciones</div>
                </div>
                <div className="text-base font-medium text-red-600">-{formatRD(data.cashReturnsTotalCents)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <div className="font-semibold">Total cobrado que quedó en mano</div>
              <div className="text-lg font-bold text-green-600">{formatRD(data.totalCollectedInHandCents)}</div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="text-base font-semibold">Ingreso Operativo Reconocido (Sin Propina Legal)</div>
            <div className="grid gap-2 pl-4">
              <div className="flex items-center justify-between">
                <div className="text-sm">Ventas contado cobradas</div>
                <div className="text-base font-medium">{formatRD(data.cashSalesRevenueNoTipCents)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Cobros de crédito aplicados a utilidad</div>
                  <div className="text-xs text-muted-foreground">
                    {data.creditSalesWithCollectionsCount} facturas a crédito con cobros
                  </div>
                </div>
                <div className="text-base font-medium">{formatRD(data.creditCollectedRevenueNoTipCents)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm">Devoluciones contado</div>
                <div className="text-base font-medium text-red-600">-{formatRD(data.cashReturnsRevenueNoTipCents)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <div className="font-semibold">Total ingresos para utilidad operativa</div>
              <div className="text-lg font-bold text-green-600">{formatRD(data.collectedRevenueNoTipCents)}</div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="text-base font-semibold">Costo De Ventas Reconocido</div>
            <div className="grid gap-2 pl-4">
              <div className="flex items-center justify-between">
                <div className="text-sm">Costo de ventas contado</div>
                <div className="text-base font-medium text-red-600">-{formatRD(data.cashSalesCostCents)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm">Costo reconocido por cobros de crédito</div>
                <div className="text-base font-medium text-red-600">-{formatRD(data.creditCollectedCostCents)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm">Reverso de costo por devoluciones contado</div>
                <div className="text-base font-medium text-green-600">{formatRD(data.cashReturnsCostCents)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <div className="font-semibold">Total costo reconocido</div>
              <div className="text-lg font-bold text-red-600">-{formatRD(data.collectedCostCents)}</div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
            <div>
              <div className="text-base font-semibold">Utilidad Bruta Cobrada</div>
              <div className="text-xs text-muted-foreground">Ingresos reconocidos - costo reconocido</div>
            </div>
            <div className={`text-xl font-bold ${data.collectedGrossProfitCents >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatRD(data.collectedGrossProfitCents)}
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <div className="text-base font-semibold">Gastos Operativos Del Período</div>
            <div className="flex items-center justify-between pl-4">
              <div>
                <div className="text-sm">Gastos operativos registrados</div>
                <div className="text-xs text-muted-foreground">{data.operatingExpensesCount} gastos</div>
              </div>
              <div className="text-base font-medium text-red-600">-{formatRD(data.operatingExpensesCents)}</div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
            <div>
              <div className="text-base font-semibold">Utilidad Operativa Cobrada</div>
              <div className="text-xs text-muted-foreground">Antes de deducir ITBIS</div>
            </div>
            <div className={`text-2xl font-bold ${data.operatingProfitCollectedCents >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatRD(data.operatingProfitCollectedCents)}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border-4 border-primary bg-primary/10 p-6">
            <div>
              <div className="text-lg font-bold">Diezmo Sugerido (10%)</div>
              <div className="text-xs text-muted-foreground">
                Se calcula sobre utilidad operativa cobrada positiva.
              </div>
            </div>
            <div className="text-3xl font-bold text-green-600">{formatRD(data.suggestedTitheCents)}</div>
          </div>

          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Referencia ITBIS de lo cobrado en el período: {formatRD(data.collectedItbisReferenceCents)}. Este valor no se descuenta en la utilidad operativa mostrada aquí.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
