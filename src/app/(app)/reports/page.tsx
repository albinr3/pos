import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function ReportsPage() {
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
            <CardTitle>Cobros (CxC)</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/reports/payments">Ver reporte de cobros</Link>
            </Button>
          </CardContent>
        </Card>
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
