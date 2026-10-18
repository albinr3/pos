"use client"

import { useState, useTransition, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ChevronLeft, ChevronRight, FileDown, FileSpreadsheet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateDO } from "@/lib/date-time"
import { formatRD } from "@/lib/money"
import { getFreightReportForExport } from "./actions"
import {
  GENERAL_CUSTOMER,
  defaultFreightFilters,
  freightReportHref,
  getFreightDateRange,
  parseFreightFilters,
  type FreightCustomer,
  type FreightFilters,
  type FreightReport,
} from "./model"

export function FreightReportClient({ report, customers }: { report: FreightReport; customers: FreightCustomer[] }) {
  const router = useRouter()
  const [filters, setFilters] = useState(report.filters)
  const [validationError, setValidationError] = useState("")
  const [exportError, setExportError] = useState("")
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null)
  const [isPending, startTransition] = useTransition()
  const busy = isPending || exporting !== null
  const { summary, pagination } = report
  const missingCustomer = filters.customerId && filters.customerId !== GENERAL_CUSTOMER
    && !customers.some((customer) => customer.id === filters.customerId)

  function changeFilter<K extends keyof FreightFilters>(key: K, value: FreightFilters[K]) {
    setValidationError("")
    setFilters((previous) => ({ ...previous, [key]: value }))
  }

  function applyFilters(nextFilters = filters) {
    setFilters(nextFilters)
    const parsed = parseFreightFilters(nextFilters)
    setValidationError(parsed.error || "")
    if (parsed.error) return
    setExportError("")
    startTransition(() => router.push(freightReportHref(parsed.filters)))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applyFilters()
  }

  function changePage(page: number) {
    startTransition(() => router.push(freightReportHref(report.filters, page)))
  }

  async function download(extension: "pdf" | "csv") {
    setExporting(extension)
    setExportError("")
    try {
      // Descargar los filtros APLICADOS evita mezclar el borrador del formulario con el resumen visible.
      const result = await getFreightReportForExport(report.filters)
      if (result.error || !result.data) throw new Error(result.error || "No se pudo generar la descarga.")
      if (result.data.rows.length === 0) throw new Error("Ya no hay facturas con esos filtros. Actualiza el reporte.")
      const { createFreightCSV, createFreightPDF, freightExportFilename } = await import("./exports")
      const filename = freightExportFilename(result.data, extension)
      if (extension === "pdf") {
        createFreightPDF(result.data).save(filename)
      } else {
        const blob = new Blob([createFreightCSV(result.data)], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        try {
          link.href = url
          link.download = filename
          document.body.appendChild(link)
          link.click()
        } finally {
          link.remove()
          URL.revokeObjectURL(url)
        }
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "No se pudo generar la descarga. Inténtalo nuevamente.")
    } finally {
      setExporting(null)
    }
  }

  const canDownload = !busy && !report.error && summary.invoiceCount > 0
  const cards = [
    { label: "Total de flete facturado", value: formatRD(summary.totalShippingCents) },
    { label: "Facturas con flete", value: summary.invoiceCount.toLocaleString("es-DO") },
    { label: "Flete en ventas al contado", value: formatRD(summary.cashShippingCents) },
    { label: "Flete en ventas a crédito", value: formatRD(summary.creditShippingCents) },
  ]

  return (
    <div className="grid gap-6" aria-busy={busy}>
      <div>
        <Link href="/reports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Reportes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Reporte de fletes</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Fletes registrados en las facturas, incluidas las ventas a crédito. El importe facturado puede estar pendiente de cobro.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!canDownload} onClick={() => download("csv")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> {exporting === "csv" ? "Exportando…" : "Descargar CSV"}
            </Button>
            <Button variant="outline" disabled={!canDownload} onClick={() => download("pdf")}>
              <FileDown className="mr-2 h-4 w-4" /> {exporting === "pdf" ? "Generando…" : "Descargar PDF"}
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent>
          <form noValidate onSubmit={submit} className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {([ ["today", "Hoy"], ["month", "Este mes"], ["previousMonth", "Mes anterior"] ] as const).map(([preset, label]) => (
                <Button key={preset} type="button" size="sm" variant="outline" disabled={busy}
                  onClick={() => applyFilters({ ...filters, ...getFreightDateRange(preset) })}>
                  {label}
                </Button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <div className="grid gap-2">
                <Label htmlFor="freight-from">Desde</Label>
                <Input id="freight-from" type="date" value={filters.from} disabled={busy}
                  onChange={(event) => changeFilter("from", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="freight-to">Hasta</Label>
                <Input id="freight-to" type="date" value={filters.to} disabled={busy}
                  onChange={(event) => changeFilter("to", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="freight-customer">Cliente</Label>
                <Select value={filters.customerId || "ALL"} disabled={busy}
                  onValueChange={(value) => changeFilter("customerId", value === "ALL" ? "" : value)}>
                  <SelectTrigger id="freight-customer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos los clientes</SelectItem>
                    <SelectItem value={GENERAL_CUSTOMER}>Cliente general</SelectItem>
                    {missingCustomer && <SelectItem value={filters.customerId}>Cliente no disponible</SelectItem>}
                    {customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="freight-type">Tipo de venta</Label>
                <Select value={filters.type} disabled={busy}
                  onValueChange={(value) => changeFilter("type", value as FreightFilters["type"])}>
                  <SelectTrigger id="freight-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="CONTADO">Contado</SelectItem>
                    <SelectItem value="CREDITO">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="freight-invoice">Número de factura</Label>
                <Input id="freight-invoice" placeholder="Ej.: A-00001" value={filters.invoiceCode} disabled={busy}
                  onChange={(event) => changeFilter("invoiceCode", event.target.value)} />
              </div>
            </div>
            {validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>{isPending ? "Cargando…" : "Aplicar filtros"}</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => applyFilters(defaultFreightFilters())}>
                Limpiar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {(report.error || exportError) && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {exportError || report.error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">{report.error ? "—" : card.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facturas con flete</CardTitle>
          <p className="text-sm text-muted-foreground">
            Período aplicado: {report.filters.from} al {report.filters.to}. Los totales abarcan todas las páginas.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[780px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Factura</TableHead><TableHead>Cliente</TableHead><TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Flete</TableHead><TableHead className="text-right">Total factura</TableHead>
                  <TableHead className="text-right">Ticket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{formatDateDO(row.soldAt, { year: "numeric", month: "2-digit", day: "2-digit" })}</TableCell>
                    <TableCell className="font-medium">{row.invoiceCode}</TableCell>
                    <TableCell>{row.customerName}</TableCell><TableCell>{row.type === "CONTADO" ? "Contado" : "Crédito"}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">{formatRD(row.shippingCents)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatRD(row.totalCents)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/api/print/sale/${encodeURIComponent(row.invoiceCode)}`} target="_blank" rel="noopener noreferrer"
                          aria-label={`Ver ticket de ${row.invoiceCode}`}>Ver ticket</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {report.rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {report.error ? "Corrige los filtros o vuelve a intentar la consulta." : "No se encontraron facturas con flete para estos filtros."}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {summary.invoiceCount === 0 ? "0 facturas" : `${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, summary.invoiceCount)} de ${summary.invoiceCount} facturas`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={busy || !!report.error || pagination.page === 1}
                onClick={() => changePage(pagination.page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm">Página {pagination.page} de {pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={busy || !!report.error || pagination.page >= pagination.totalPages}
                onClick={() => changePage(pagination.page + 1)} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
