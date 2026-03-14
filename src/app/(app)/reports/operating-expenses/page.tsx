import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatRD } from "@/lib/money"

import { ReportDateRangeFilter } from "../filter-client"
import { getOperatingExpensesReport } from "../actions"
import { DownloadPdfButton } from "@/components/app/download-pdf-button"
import { OperatingExpensesExportClient } from "./operating-expenses-export-client"

export const dynamic = "force-dynamic"

export default async function OperatingExpensesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const data = await getOperatingExpensesReport({ from: sp.from, to: sp.to })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reporte de gastos operativos</h1>
          <p className="text-sm text-muted-foreground">Listado y total por rango.</p>
        </div>
        <div className="flex items-center gap-2">
          <DownloadPdfButton />
          <OperatingExpensesExportClient expenses={data.expenses} totalCents={data.totalCents} />
          <ReportDateRangeFilter basePath="/reports/operating-expenses" defaultLastDays={0} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total: {formatRD(data.totalCents)} ({data.count} gastos)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Registrado por</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.expenses.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{new Date(item.expenseDate).toLocaleDateString("es-DO", { timeZone: "America/Santo_Domingo" })}</TableCell>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell>{item.category ?? "—"}</TableCell>
                    <TableCell>{item.user.name || item.user.username}</TableCell>
                    <TableCell className="text-right">{formatRD(item.amountCents)}</TableCell>
                  </TableRow>
                ))}

                {data.expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Sin gastos operativos en el rango.
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
