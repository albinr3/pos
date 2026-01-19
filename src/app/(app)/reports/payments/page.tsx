import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRD } from "@/lib/money"

import { ReportDateRangeFilter } from "../filter-client"
import { getPaymentsReport } from "../actions"
import { PrintButton } from "@/components/app/print-button"

export default async function PaymentsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const data = await getPaymentsReport({ from: sp.from, to: sp.to })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reporte de cobros</h1>
          <p className="text-sm text-muted-foreground">Abonos registrados por rango.</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <ReportDateRangeFilter basePath="/reports/payments" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total: {formatRD(data.totalCents)} ({data.count} pagos)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Reimprimir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.ar.sale.invoiceCode}</TableCell>
                    <TableCell>{p.ar.customer.name}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="text-right">{formatRD(p.amountCents)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/receipts/payment/${p.id}`} target="_blank">Recibo</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {data.payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Sin cobros en el rango.
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
