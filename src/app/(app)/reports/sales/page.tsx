import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRD } from "@/lib/money"
import { formatCustomerName } from "@/lib/customer-display"

import { ReportDateRangeFilter } from "../filter-client"
import { getSalesReport } from "../actions"
import { DownloadPdfButton } from "@/components/app/download-pdf-button"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: "CONTADO" | "CREDITO" }>
}) {
  const sp = await searchParams
  const typeFilter = sp.type === "CONTADO" || sp.type === "CREDITO" ? sp.type : undefined
  const data = await getSalesReport({ from: sp.from, to: sp.to, type: typeFilter })

  const buildFilterHref = (nextType?: "CONTADO" | "CREDITO") => {
    const params = new URLSearchParams()
    if (sp.from) params.set("from", sp.from)
    if (sp.to) params.set("to", sp.to)
    if (nextType) params.set("type", nextType)
    return `/reports/sales${params.toString() ? `?${params.toString()}` : ""}`
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reporte de ventas</h1>
          <p className="text-sm text-muted-foreground">Listado y total por rango.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant={typeFilter === undefined ? "default" : "outline"} size="sm">
            <Link href={buildFilterHref()}>Todos</Link>
          </Button>
          <Button asChild variant={typeFilter === "CONTADO" ? "default" : "outline"} size="sm">
            <Link href={buildFilterHref("CONTADO")}>Contado</Link>
          </Button>
          <Button asChild variant={typeFilter === "CREDITO" ? "default" : "outline"} size="sm">
            <Link href={buildFilterHref("CREDITO")}>Crédito</Link>
          </Button>
          <DownloadPdfButton />
          <ReportDateRangeFilter basePath="/reports/sales" defaultLastDays={0} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total: {formatRD(data.totalCents)} ({data.count} facturas)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Propina legal cobrada en el rango: {formatRD(data.legalTipTotalCents ?? 0)}
          </p>
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
                    <TableCell>{formatCustomerName(s.customer)}</TableCell>
                    <TableCell>{s.type === "CREDITO" ? "Crédito" : "Contado"}</TableCell>
                    <TableCell className="text-right">{formatRD(s.totalCents)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/api/print/sale/${s.invoiceCode}`} target="_blank">Ticket</Link>
                        </Button>
                        {/* Formato carta oculto temporalmente en la UI */}
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
