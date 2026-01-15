import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatRD } from "@/lib/money"

import { getDashboardStats, getSalesChartData } from "./actions"
import { SalesChart } from "./sales-chart"

export default async function DashboardPage() {
  const stats = await getDashboardStats()
  const chartData = await getSalesChartData(7)

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Resumen de ventas, inventario y cuentas por cobrar.</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/daily-close">Ver cuadre diario</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Venta total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(stats.salesTodayCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.salesTodayCount} facturas</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Venta al contado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(stats.salesCashCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.salesCashCount} facturas</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Venta a crédito</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(stats.salesCreditCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.salesCreditCount} facturas</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Cobros hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(stats.paymentsTodayCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.paymentsTodayCount} pagos</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Cuentas por cobrar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRD(stats.arOpenCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.arOpenCount} facturas</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Stock bajo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stats.lowStockCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ventas de los últimos 7 días</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart data={chartData} />
        </CardContent>
      </Card>
    </div>
  )
}
