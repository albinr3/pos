import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { requireModuleAccess } from "@/lib/module-access"
import { hasPermission } from "@/lib/permissions"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function ReportsPage() {
  await requireModuleAccess("canAccessReports")

  const user = await getCurrentUser()
  const canViewProfit = user
    ? hasPermission(user, "canViewProfitReport", { allowAdminBypass: false })
    : false
  const canViewTitheReport = (user?.email ?? "").trim().toLowerCase() === "albinmrodriguez@gmail.com"
  
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">Reportes por rango de fecha.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/reports/sales">Ver reporte de ventas</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gastos operativos</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/reports/operating-expenses">Ver reporte de gastos</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cuentas por Cobrar</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/reports/ar">Ver cuentas por cobrar</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recibos CxC</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/reports/receipts">Ver reporte de recibos</Link>
            </Button>
          </CardContent>
        </Card>
        {canViewProfit && (
          <Card>
            <CardHeader>
              <CardTitle>Ganancia</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/reports/profit">Ver estado de resultados</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        {canViewTitheReport && (
          <Card>
            <CardHeader>
              <CardTitle>Diezmo</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/reports/tithe">Ver reporte de diezmo</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Inventario</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/reports/inventory">Ver reporte de inventario</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
