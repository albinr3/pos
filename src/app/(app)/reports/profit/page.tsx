import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatRD } from "@/lib/money"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"

import { ReportDateRangeFilter } from "../filter-client"
import { getProfitReport } from "../actions"
import { PrintButton } from "@/components/app/print-button"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function ProfitReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  // Verificar permiso para ver reporte de ganancia
  if (!user.canViewProfitReport && user.role !== "ADMIN") {
    redirect("/reports")
  }

  const sp = await searchParams
  // Pasar los parámetros explícitamente, incluso si están vacíos
  const data = await getProfitReport({ 
    from: sp.from || undefined, 
    to: sp.to || undefined 
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estado de Resultados (Ganancia)</h1>
          <p className="text-sm text-muted-foreground">Ganancia calculada por período.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <ReportDateRangeFilter basePath="/reports/profit" defaultLastDays={30} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado de Resultados</CardTitle>
          <div className="text-xs text-muted-foreground mt-2">
            Período: {new Date(data.from).toLocaleDateString("es-DO")} - {new Date(data.to).toLocaleDateString("es-DO")}
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* INGRESOS/VENTAS */}
          <div className="grid gap-3">
            <div className="text-base font-semibold">Ingresos / Ventas</div>
            <div className="grid gap-2 pl-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Ventas al Contado</div>
                  <div className="text-xs text-muted-foreground">{data.salesCount} facturas</div>
                </div>
                <div className="text-base font-medium text-green-600">{formatRD(data.salesTotalCents)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Pagos Recibidos</div>
                  <div className="text-xs text-muted-foreground">{data.paymentsCount} pagos</div>
                </div>
                <div className="text-base font-medium text-green-600">{formatRD(data.paymentsTotalCents)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <div className="font-semibold">Total Ingresos</div>
              <div className="text-lg font-bold text-green-600">{formatRD(data.totalRevenueCents)}</div>
            </div>
          </div>

          <Separator />

          {/* COSTO DE VENTAS */}
          <div className="grid gap-3">
            <div className="text-base font-semibold">Costo de Ventas</div>
            <div className="flex items-center justify-between pl-4">
              <div>
                <div className="text-sm">Costo de lo vendido</div>
                <div className="text-xs text-muted-foreground">Costo de productos vendidos</div>
              </div>
              <div className="text-base font-medium text-red-600">-{formatRD(data.costOfSalesCents)}</div>
            </div>
          </div>

          <Separator />

          {/* UTILIDAD BRUTA */}
          <div className="flex items-center justify-between rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
            <div>
              <div className="text-base font-semibold">Utilidad Bruta</div>
              <div className="text-xs text-muted-foreground">Ventas - Costo de ventas</div>
            </div>
            <div className={`text-xl font-bold ${data.grossProfitCents >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatRD(data.grossProfitCents)}
            </div>
          </div>

          <Separator />

          {/* GASTOS OPERATIVOS */}
          <div className="grid gap-3">
            <div className="text-base font-semibold">Gastos Operativos</div>
            <div className="flex items-center justify-between pl-4">
              <div>
                <div className="text-sm">Total gastos operativos</div>
                <div className="text-xs text-muted-foreground">{data.operatingExpensesCount} gastos</div>
              </div>
              <div className="text-base font-medium text-red-600">-{formatRD(data.operatingExpensesCents)}</div>
            </div>
          </div>

          <Separator />

          {/* UTILIDAD OPERATIVA */}
          <div className="flex items-center justify-between rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
            <div>
              <div className="text-base font-semibold">Utilidad Operativa</div>
              <div className="text-xs text-muted-foreground">Utilidad bruta - Gastos operativos</div>
            </div>
            <div className={`text-xl font-bold ${data.operatingProfitCents >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatRD(data.operatingProfitCents)}
            </div>
          </div>

          <Separator />

          {/* OTROS INGRESOS Y GASTOS */}
          <div className="grid gap-3">
            <div className="text-base font-semibold">Otros Ingresos y Gastos</div>
            <div className="flex items-center justify-between pl-4">
              <div className="text-sm text-muted-foreground">Intereses, diferencias en cambio, etc.</div>
              <div className="text-base font-medium">{formatRD(data.otherIncomeExpensesCents)}</div>
            </div>
          </div>

          <Separator />

          {/* IMPUESTOS */}
          <div className="grid gap-3">
            <div className="text-base font-semibold">Impuestos</div>
            <div className="flex items-center justify-between pl-4">
              <div className="text-sm text-muted-foreground">Impuestos sobre la renta</div>
              <div className="text-base font-medium">{formatRD(data.taxesCents)}</div>
            </div>
          </div>

          <Separator />

          {/* UTILIDAD NETA */}
          <div className="flex items-center justify-between rounded-lg border-4 border-primary bg-primary/10 p-6">
            <div>
              <div className="text-lg font-bold">Utilidad Neta (Resultado del Período)</div>
              <div className="text-xs text-muted-foreground">Utilidad operativa - Otros ingresos/gastos - Impuestos</div>
            </div>
            <div className={`text-3xl font-bold ${data.netProfitCents >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatRD(data.netProfitCents)}
            </div>
          </div>

          <Separator />

          {/* CUENTAS POR COBRAR */}
          <div className="grid gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Cuentas por Cobrar</div>
                  <div className="text-xs text-muted-foreground">{data.accountsReceivableCount} cuentas pendientes</div>
                </div>
                <div className="text-lg font-semibold">{formatRD(data.accountsReceivableTotalCents)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

