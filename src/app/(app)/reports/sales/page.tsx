import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRD } from "@/lib/money"

import { ReportDateRangeFilter } from "../filter-client"
import { getSalesReport } from "../actions"
import { PrintButton } from "@/components/app/print-button"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const data = await getSalesReport({ from: sp.from, to: sp.to })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reporte de ventas</h1>
          <p className="text-sm text-muted-foreground">Listado y total por rango.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <ReportDateRangeFilter basePath="/reports/sales" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total: {formatRD(data.totalCents)} ({data.count} facturas)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Reimprimir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.invoiceCode}</TableCell>
                    <TableCell>{s.customer?.name ?? "Cliente"}</TableCell>
                    <TableCell>{s.type}</TableCell>
                    <TableCell className="text-right">{formatRD(s.totalCents)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/receipts/sale/${s.invoiceCode}`} target="_blank">Ticket</Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/invoices/${s.invoiceCode}`} target="_blank">Carta</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {data.sales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Sin ventas en el rango.
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
