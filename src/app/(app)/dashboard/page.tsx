import Link from "next/link"
import { DollarSign, CreditCard, TrendingUp, Receipt, Wallet, AlertTriangle } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatRD } from "@/lib/money"
import { cn } from "@/lib/utils"

import { getDashboardStats, getSalesChartData } from "./actions"
import { SalesChart } from "./sales-chart"

export default async function DashboardPage() {
  const stats = await getDashboardStats()
  const chartData = await getSalesChartData(7)

  return (
    <div className="grid gap-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Resumen de ventas, inventario y cuentas por cobrar.</p>
        </div>
        <Button asChild variant="secondary" className="w-full sm:w-auto">
          <Link href="/daily-close">Ver cuadre diario</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-purple-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Venta total</CardTitle>
            <DollarSign className="h-5 w-5 text-purple-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-purple-primary">{formatRD(stats.salesTodayCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.salesTodayCount} facturas</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Venta al contado</CardTitle>
            <Receipt className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-green-600">{formatRD(stats.salesCashCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.salesCashCount} facturas</div>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: 'rgb(253, 186, 116)' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Venta a crédito</CardTitle>
            <CreditCard className="h-5 w-5" style={{ color: 'rgb(253, 186, 116)' }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold" style={{ color: 'rgb(253, 186, 116)' }}>{formatRD(stats.salesCreditCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.salesCreditCount} facturas</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cobros hoy</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-blue-500">{formatRD(stats.paymentsTodayCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.paymentsTodayCount} pagos</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cuentas por cobrar</CardTitle>
            <Wallet className="h-5 w-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-red-600">{formatRD(stats.arOpenCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{stats.arOpenCount} facturas</div>
          </CardContent>
        </Card>
        <Card className={cn("border-l-4", stats.lowStockCount > 0 ? "border-l-red-500" : "border-l-gray-300")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock bajo</CardTitle>
            <AlertTriangle className={cn("h-5 w-5", stats.lowStockCount > 0 ? "text-red-500" : "text-gray-400")} />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-semibold", stats.lowStockCount > 0 ? "text-red-500" : "text-muted-foreground")}>{stats.lowStockCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">productos</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-t-2 border-t-purple-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-primary" />
            Ventas de los últimos 7 días
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart data={chartData} />
        </CardContent>
      </Card>
    </div>
  )
}
