import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRD } from "@/lib/money"
import { getCurrentUser } from "@/lib/auth"

import { getInventoryReport } from "../actions"
import { InventoryExportClient } from "./inventory-export-client"
import { DownloadPdfButton } from "@/components/app/download-pdf-button"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function InventoryReportPage() {
  const user = await getCurrentUser()
  const canViewCosts = user?.canViewProductCosts || user?.role === "ADMIN"
  const data = await getInventoryReport()

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reporte de inventario</h1>
          <p className="text-sm text-muted-foreground">Listado de productos con su costo y total de inventario.</p>
        </div>
        <div className="flex items-center gap-2">
          <DownloadPdfButton />
          <InventoryExportClient
            products={data.products}
            totalInventoryCostCents={data.totalInventoryCostCents}
            count={data.count}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {canViewCosts 
              ? `Total de inventario en costo: ${formatRD(data.totalInventoryCostCents)} (${data.count} productos)`
              : `Inventario: ${data.count} productos`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  {canViewCosts && (
                    <>
                      <TableHead className="text-right">Costo unitario</TableHead>
                      <TableHead className="text-right">Costo total</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((product) => {
                  const totalCostCents = product.costCents * product.stock
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.sku ?? "-"}</TableCell>
                      <TableCell>{product.supplier?.name ?? "-"}</TableCell>
                      <TableCell className="text-right">{product.stock}</TableCell>
                      {canViewCosts && (
                        <>
                          <TableCell className="text-right">{formatRD(product.costCents)}</TableCell>
                          <TableCell className="text-right font-medium">{formatRD(totalCostCents)}</TableCell>
                        </>
                      )}
                    </TableRow>
                  )
                })}

                {data.products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canViewCosts ? 6 : 4} className="py-10 text-center text-sm text-muted-foreground">
                      No hay productos activos en el inventario.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

