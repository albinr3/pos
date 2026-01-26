"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { formatRD } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { exportARToCSV, getARReportForPDF, type ARFilters } from "./actions"
import Link from "next/link"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

interface Customer {
  id: string
  name: string
}

interface ARItem {
  id: string
  status: string
  totalCents: number
  balanceCents: number
  dueDate: Date | null
  customer: {
    name: string
    phone: string | null
    cedula: string | null
  }
  sale: {
    invoiceCode: string
    soldAt: Date
    totalCents: number
  }
  payments: Array<{
    amountCents: number
    paidAt: Date
    method: string
    receiptCode: string
  }>
}

interface ReportData {
  arItems: ARItem[]
  stats: {
    totalItems: number
    totalPendiente: number
    totalVencido: number
    countVencidas: number
    topDebtors: Array<{
      customerId: string
      customerName: string
      balance: number
      invoiceCount: number
    }>
  }
}

export function ARReportClient({
  initialData,
  customers,
  initialFilters,
}: {
  initialData: ReportData
  customers: Customer[]
  initialFilters: ARFilters
}) {
  const router = useRouter()
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingPDF, setIsExportingPDF] = useState(false)

  const [filters, setFilters] = useState<ARFilters>(initialFilters)

  const handleFilterChange = (key: keyof ARFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const applyFilters = () => {
    const params = new URLSearchParams()
    
    if (filters.status) params.set("status", filters.status)
    if (filters.customerId) params.set("customerId", filters.customerId)
    if (filters.invoiceCode) params.set("invoiceCode", filters.invoiceCode)
    if (filters.startDate) params.set("startDate", filters.startDate)
    if (filters.endDate) params.set("endDate", filters.endDate)
    if (filters.minAmount !== undefined) params.set("minAmount", filters.minAmount.toString())
    if (filters.maxAmount !== undefined) params.set("maxAmount", filters.maxAmount.toString())
    if (filters.overdueOnly) params.set("overdueOnly", "true")

    router.push(`/reports/ar?${params.toString()}`)
  }

  const clearFilters = () => {
    setFilters({})
    router.push("/reports/ar")
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const csv = await exportARToCSV(filters)
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `cuentas-por-cobrar-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Error al exportar:", error)
      alert("Error al exportar el reporte")
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPDF = async () => {
    setIsExportingPDF(true)
    try {
      const data = await getARReportForPDF(filters)

      const doc = new jsPDF()
      
      // Encabezado
      doc.setFontSize(18)
      doc.setFont("helvetica", "bold")
      doc.text("CUENTAS POR COBRAR", 105, 15, { align: "center" })
      
      doc.setFontSize(12)
      doc.setFont("helvetica", "normal")
      doc.text(data.company?.name || "Mi Negocio", 105, 22, { align: "center" })

      // Información del reporte
      doc.setFontSize(9)
      let yPos = 30
      doc.text(`Generado por: ${data.generatedBy}`, 14, yPos)
      doc.text(`Fecha: ${new Date(data.generatedAt).toLocaleString("es-DO")}`, 14, yPos + 5)

      // Estadísticas
      yPos += 15
      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
      doc.text("Resumen", 14, yPos)
      
      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      yPos += 5
      doc.text(`Total Facturas: ${data.stats.totalItems}`, 14, yPos)
      doc.text(`Total Pendiente: ${formatRD(data.stats.totalPendiente)}`, 70, yPos)
      doc.text(`Total Vencido: ${formatRD(data.stats.totalVencido)}`, 130, yPos)
      yPos += 5
      doc.text(`Facturas Vencidas: ${data.stats.countVencidas}`, 14, yPos)

      // Tabla
      yPos += 5
      
      const tableData = data.arItems.map(ar => {
        const diasVencido = ar.dueDate 
          ? Math.floor((new Date().getTime() - new Date(ar.dueDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0
        
        return [
          ar.sale.invoiceCode,
          new Date(ar.sale.soldAt).toLocaleDateString("es-DO"),
          ar.customer.name.substring(0, 20),
          formatRD(ar.totalCents),
          formatRD(ar.balanceCents),
          ar.status,
          ar.dueDate && diasVencido > 0 ? `${diasVencido}d` : "-",
        ]
      })

      autoTable(doc, {
        startY: yPos,
        head: [["Factura", "Fecha", "Cliente", "Total", "Pendiente", "Estado", "Vencido"]],
        body: tableData,
        theme: "striped",
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [51, 51, 51],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        columnStyles: {
          0: { fontStyle: "bold", font: "courier" },
          3: { halign: "right", fontStyle: "bold" },
          4: { halign: "right", fontStyle: "bold" },
          5: { fontStyle: "bold" },
        },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 6) {
            const diasVencido = data.cell.text[0]
            if (diasVencido !== "-" && diasVencido !== "0d") {
              data.cell.styles.textColor = [220, 38, 38]
              data.cell.styles.fontStyle = "bold"
            }
          }
        },
      })

      const fileName = `cuentas-por-cobrar-${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)
    } catch (error) {
      console.error("Error al generar PDF:", error)
      alert("Error al generar el PDF")
    } finally {
      setIsExportingPDF(false)
    }
  }

  const fmtDate = (d: Date) => {
    return new Intl.DateTimeFormat("es-DO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(d))
  }

  const getDiasVencido = (dueDate: Date | null) => {
    if (!dueDate) return 0
    const dias = Math.floor((new Date().getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
    return dias > 0 ? dias : 0
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cuentas por Cobrar</h1>
        <div className="flex gap-2">
          <Button onClick={handleExport} disabled={isExporting} variant="outline">
            {isExporting ? "Exportando..." : "📥 CSV"}
          </Button>
          <Button onClick={handleExportPDF} disabled={isExportingPDF}>
            {isExportingPDF ? "Generando..." : "📄 PDF"}
          </Button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-neutral-500">Total Facturas</div>
          <div className="text-2xl font-bold">{initialData.stats.totalItems}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-neutral-500">Total Pendiente</div>
          <div className="text-2xl font-bold text-orange-600">
            {formatRD(initialData.stats.totalPendiente)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-neutral-500">Total Vencido</div>
          <div className="text-2xl font-bold text-red-600">
            {formatRD(initialData.stats.totalVencido)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-neutral-500">Facturas Vencidas</div>
          <div className="text-2xl font-bold text-red-600">
            {initialData.stats.countVencidas}
          </div>
        </Card>
      </div>

      {/* Top Deudores */}
      {initialData.stats.topDebtors.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 font-semibold">Mayores Deudores</h3>
          <div className="space-y-2">
            {initialData.stats.topDebtors.map((debtor, index) => (
              <div key={debtor.customerId} className="flex items-center justify-between border-b pb-2">
                <div>
                  <span className="mr-2 font-bold text-neutral-500">#{index + 1}</span>
                  <span className="font-medium">{debtor.customerName}</span>
                  <span className="ml-2 text-sm text-neutral-500">({debtor.invoiceCount} facturas)</span>
                </div>
                <div className="font-bold text-red-600">{formatRD(debtor.balance)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filtros */}
      <Card className="p-4">
        <h3 className="mb-4 font-semibold">Filtros</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Estado</Label>
            <Select
              value={filters.status || "PENDING"}
              onValueChange={(v) => handleFilterChange("status", v === "PENDING" ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pendientes y Parciales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pendientes y Parciales</SelectItem>
                <SelectItem value="PENDIENTE">Solo Pendientes</SelectItem>
                <SelectItem value="PARCIAL">Solo Parciales</SelectItem>
                <SelectItem value="ALL">Todas (incluye pagadas)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cliente</Label>
            <Select
              value={filters.customerId || "ALL"}
              onValueChange={(v) => handleFilterChange("customerId", v === "ALL" ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los clientes</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Código de Factura</Label>
            <Input
              placeholder="A-00001"
              value={filters.invoiceCode || ""}
              onChange={(e) => handleFilterChange("invoiceCode", e.target.value)}
            />
          </div>
          <div>
            <Label>Fecha Desde</Label>
            <Input
              type="date"
              value={filters.startDate || ""}
              onChange={(e) => handleFilterChange("startDate", e.target.value)}
            />
          </div>
          <div>
            <Label>Fecha Hasta</Label>
            <Input
              type="date"
              value={filters.endDate || ""}
              onChange={(e) => handleFilterChange("endDate", e.target.value)}
            />
          </div>
          <div>
            <Label>Monto Mínimo Pendiente</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={filters.minAmount || ""}
              onChange={(e) => handleFilterChange("minAmount", e.target.value ? parseFloat(e.target.value) : undefined)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="overdueOnly"
              checked={filters.overdueOnly || false}
              onChange={(e) => handleFilterChange("overdueOnly", e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="overdueOnly">Solo facturas vencidas</Label>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={applyFilters}>Aplicar Filtros</Button>
          <Button variant="outline" onClick={clearFilters}>
            Limpiar
          </Button>
        </div>
      </Card>

      {/* Tabla de CxC */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr className="border-b">
                <th className="p-3 text-left text-sm font-medium">Factura</th>
                <th className="p-3 text-left text-sm font-medium">Fecha</th>
                <th className="p-3 text-left text-sm font-medium">Cliente</th>
                <th className="p-3 text-right text-sm font-medium">Total</th>
                <th className="p-3 text-right text-sm font-medium">Pagado</th>
                <th className="p-3 text-right text-sm font-medium">Pendiente</th>
                <th className="p-3 text-left text-sm font-medium">Estado</th>
                <th className="p-3 text-left text-sm font-medium">Vencimiento</th>
                <th className="p-3 text-left text-sm font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {initialData.arItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-neutral-500">
                    No se encontraron cuentas por cobrar con los filtros seleccionados
                  </td>
                </tr>
              ) : (
                initialData.arItems.map((ar) => {
                  const totalPagado = ar.totalCents - ar.balanceCents
                  const diasVencido = getDiasVencido(ar.dueDate)
                  const isOverdue = diasVencido > 0

                  return (
                    <tr
                      key={ar.id}
                      className={`border-b hover:bg-neutral-50 ${
                        isOverdue ? "bg-red-50/50" : ""
                      }`}
                    >
                      <td className="p-3">
                        <div className="font-mono font-semibold">{ar.sale.invoiceCode}</div>
                      </td>
                      <td className="p-3 text-sm">{fmtDate(ar.sale.soldAt)}</td>
                      <td className="p-3">
                        <div className="font-medium">{ar.customer.name}</div>
                        {ar.customer.phone && (
                          <div className="text-xs text-neutral-500">{ar.customer.phone}</div>
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">{formatRD(ar.totalCents)}</td>
                      <td className="p-3 text-right text-green-600">{formatRD(totalPagado)}</td>
                      <td className="p-3 text-right">
                        <div className="font-bold text-orange-600">{formatRD(ar.balanceCents)}</div>
                      </td>
                      <td className="p-3">
                        <span className={`text-sm font-semibold ${
                          ar.status === "PAGADA" ? "text-green-600" : 
                          ar.status === "PARCIAL" ? "text-orange-600" : "text-red-600"
                        }`}>
                          {ar.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {ar.dueDate ? (
                          <div>
                            <div className="text-sm">{fmtDate(ar.dueDate)}</div>
                            {isOverdue && (
                              <div className="text-xs font-semibold text-red-600">
                                Vencido {diasVencido} días
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-neutral-400">Sin fecha</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Link href={`/ar?customerId=${ar.customer}`}>
                          <Button size="sm" variant="outline">
                            Ver Detalles
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
