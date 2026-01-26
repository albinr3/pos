"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { exportReceiptsToCSV, getReceiptsReportForPDF, type ReceiptFilters } from "./actions"
import Link from "next/link"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

interface Customer {
  id: string
  name: string
}

interface Payment {
  id: string
  receiptCode: string
  receiptNumber: number
  paidAt: Date
  amountCents: number
  method: string
  note: string | null
  cancelledAt: Date | null
  ar: {
    customer: {
      name: string
      phone: string | null
    }
    sale: {
      invoiceCode: string
      totalCents: number
    }
    balanceCents: number
  }
  user: {
    name: string
    username: string | null
  }
  cancelledUser: {
    name: string
  } | null
}

interface ReportData {
  payments: Payment[]
  stats: {
    totalPayments: number
    cancelledPayments: number
    totalAmount: number
    cancelledAmount: number
    byMethod: Record<string, { count: number; total: number }>
  }
}

export function ReceiptsReportClient({
  initialData,
  customers,
  initialFilters,
}: {
  initialData: ReportData
  customers: Customer[]
  initialFilters: ReceiptFilters
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingPDF, setIsExportingPDF] = useState(false)

  const [filters, setFilters] = useState<ReceiptFilters>(initialFilters)

  const handleFilterChange = (key: keyof ReceiptFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const applyFilters = () => {
    const params = new URLSearchParams()
    
    if (filters.startDate) params.set("startDate", filters.startDate)
    if (filters.endDate) params.set("endDate", filters.endDate)
    if (filters.customerId) params.set("customerId", filters.customerId)
    if (filters.receiptCode) params.set("receiptCode", filters.receiptCode)
    if (filters.method) params.set("method", filters.method)
    if (filters.minAmount !== undefined) params.set("minAmount", filters.minAmount.toString())
    if (filters.maxAmount !== undefined) params.set("maxAmount", filters.maxAmount.toString())
    if (filters.includeCancelled) params.set("includeCancelled", "true")

    router.push(`/reports/receipts?${params.toString()}`)
  }

  const clearFilters = () => {
    setFilters({})
    router.push("/reports/receipts")
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const csv = await exportReceiptsToCSV(filters)
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `recibos-${new Date().toISOString().split('T')[0]}.csv`)
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
      // Obtener los datos del reporte
      const data = await getReceiptsReportForPDF(filters)

      // Crear el PDF
      const doc = new jsPDF()
      
      // Encabezado
      doc.setFontSize(18)
      doc.setFont("helvetica", "bold")
      doc.text("REPORTE DE RECIBOS", 105, 15, { align: "center" })
      
      doc.setFontSize(12)
      doc.setFont("helvetica", "normal")
      doc.text(data.company?.name || "Mi Negocio", 105, 22, { align: "center" })
      
      if (data.company?.address) {
        doc.setFontSize(9)
        doc.text(data.company.address, 105, 27, { align: "center" })
      }

      // Información del reporte
      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      let yPos = 35
      doc.text(`Generado por: ${data.generatedBy}`, 14, yPos)
      doc.text(`Fecha: ${new Date(data.generatedAt).toLocaleString("es-DO")}`, 14, yPos + 5)
      
      if (filters.startDate || filters.endDate) {
        yPos += 10
        if (filters.startDate) {
          doc.text(`Desde: ${filters.startDate}`, 14, yPos)
        }
        if (filters.endDate) {
          doc.text(`Hasta: ${filters.endDate}`, 14, yPos + 5)
        }
      }

      // Estadísticas
      yPos += 15
      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
      doc.text("Estadísticas", 14, yPos)
      
      doc.setFontSize(9)
      doc.setFont("helvetica", "normal")
      yPos += 5
      doc.text(`Total Recibos: ${data.stats.totalPayments}`, 14, yPos)
      doc.text(`Monto Total: ${formatRD(data.stats.totalAmount)}`, 80, yPos)
      doc.text(`Cancelados: ${data.stats.cancelledPayments}`, 140, yPos)

      // Tabla de recibos
      yPos += 5
      
      const tableData = data.payments.map(p => [
        p.receiptCode,
        new Date(p.paidAt).toLocaleDateString("es-DO"),
        p.ar.customer.name.substring(0, 25),
        p.ar.sale.invoiceCode,
        formatRD(p.amountCents),
        p.method,
        p.user.name.substring(0, 15),
        p.cancelledAt ? "CANCELADO" : "ACTIVO",
      ])

      autoTable(doc, {
        startY: yPos,
        head: [["Recibo", "Fecha", "Cliente", "Factura", "Monto", "Método", "Cajero", "Estado"]],
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
          0: { fontStyle: "bold", font: "courier" }, // Recibo
          3: { font: "courier" }, // Factura
          4: { halign: "right", fontStyle: "bold" }, // Monto
          7: { fontStyle: "bold" }, // Estado
        },
        didParseCell: (data: any) => {
          // Colorear las filas canceladas
          if (data.section === "body" && data.column.index === 7) {
            const rowIndex = data.row.index
            if (rowIndex < tableData.length && tableData[rowIndex][7] === "CANCELADO") {
              data.cell.styles.textColor = [220, 38, 38]
            } else {
              data.cell.styles.textColor = [22, 163, 74]
            }
          }
          
          // Aplicar fondo rojo a toda la fila si está cancelada
          if (data.section === "body") {
            const rowIndex = data.row.index
            if (rowIndex < tableData.length && tableData[rowIndex][7] === "CANCELADO") {
              data.cell.styles.fillColor = [254, 226, 226]
            }
          }
        },
      })

      // Guardar el PDF
      const fileName = `recibos-${new Date().toISOString().split('T')[0]}.pdf`
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

  const fmtDateTime = (d: Date) => {
    return new Intl.DateTimeFormat("es-DO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reporte de Recibos</h1>
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
          <div className="text-sm text-neutral-500">Total Recibos</div>
          <div className="text-2xl font-bold">{initialData.stats.totalPayments}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-neutral-500">Monto Total</div>
          <div className="text-2xl font-bold text-green-600">
            {formatRD(initialData.stats.totalAmount)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-neutral-500">Cancelados</div>
          <div className="text-2xl font-bold text-red-600">
            {initialData.stats.cancelledPayments}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-neutral-500">Monto Cancelado</div>
          <div className="text-2xl font-bold text-red-600">
            {formatRD(initialData.stats.cancelledAmount)}
          </div>
        </Card>
      </div>

      {/* Estadísticas por método de pago */}
      {Object.keys(initialData.stats.byMethod).length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 font-semibold">Por Método de Pago</h3>
          <div className="grid gap-3 md:grid-cols-4">
            {Object.entries(initialData.stats.byMethod).map(([method, data]) => (
              <div key={method} className="rounded border p-3">
                <div className="text-sm font-medium">{method}</div>
                <div className="text-lg font-bold">{formatRD(data.total)}</div>
                <div className="text-xs text-neutral-500">{data.count} recibos</div>
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
            <Label>Código de Recibo</Label>
            <Input
              placeholder="R-000001"
              value={filters.receiptCode || ""}
              onChange={(e) => handleFilterChange("receiptCode", e.target.value)}
            />
          </div>
          <div>
            <Label>Método de Pago</Label>
            <Select
              value={filters.method || "ALL"}
              onValueChange={(v) => handleFilterChange("method", v === "ALL" ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="EFECTIVO">EFECTIVO</SelectItem>
                <SelectItem value="TRANSFERENCIA">TRANSFERENCIA</SelectItem>
                <SelectItem value="TARJETA">TARJETA</SelectItem>
                <SelectItem value="OTRO">OTRO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Monto Mínimo</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={filters.minAmount || ""}
              onChange={(e) => handleFilterChange("minAmount", e.target.value ? parseFloat(e.target.value) : undefined)}
            />
          </div>
          <div>
            <Label>Monto Máximo</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={filters.maxAmount || ""}
              onChange={(e) => handleFilterChange("maxAmount", e.target.value ? parseFloat(e.target.value) : undefined)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="includeCancelled"
              checked={filters.includeCancelled || false}
              onChange={(e) => handleFilterChange("includeCancelled", e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="includeCancelled">Incluir cancelados</Label>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={applyFilters}>Aplicar Filtros</Button>
          <Button variant="outline" onClick={clearFilters}>
            Limpiar
          </Button>
        </div>
      </Card>

      {/* Tabla de recibos */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr className="border-b">
                <th className="p-3 text-left text-sm font-medium">Recibo</th>
                <th className="p-3 text-left text-sm font-medium">Fecha</th>
                <th className="p-3 text-left text-sm font-medium">Cliente</th>
                <th className="p-3 text-left text-sm font-medium">Factura</th>
                <th className="p-3 text-right text-sm font-medium">Monto</th>
                <th className="p-3 text-left text-sm font-medium">Método</th>
                <th className="p-3 text-left text-sm font-medium">Cajero</th>
                <th className="p-3 text-left text-sm font-medium">Estado</th>
                <th className="p-3 text-left text-sm font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {initialData.payments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-neutral-500">
                    No se encontraron recibos con los filtros seleccionados
                  </td>
                </tr>
              ) : (
                initialData.payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className={`border-b hover:bg-neutral-50 ${
                      payment.cancelledAt ? "bg-red-50/50" : ""
                    }`}
                  >
                    <td className="p-3">
                      <div className="font-mono font-semibold">{payment.receiptCode}</div>
                    </td>
                    <td className="p-3 text-sm">{fmtDate(payment.paidAt)}</td>
                    <td className="p-3">
                      <div className="font-medium">{payment.ar.customer.name}</div>
                      {payment.ar.customer.phone && (
                        <div className="text-xs text-neutral-500">{payment.ar.customer.phone}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-mono text-sm">{payment.ar.sale.invoiceCode}</div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="font-semibold">{formatRD(payment.amountCents)}</div>
                      {payment.note && (
                        <div className="text-xs text-neutral-500">{payment.note}</div>
                      )}
                    </td>
                    <td className="p-3 text-sm">{payment.method}</td>
                    <td className="p-3 text-sm">{payment.user.name}</td>
                    <td className="p-3">
                      {payment.cancelledAt ? (
                        <div>
                          <div className="text-sm font-semibold text-red-600">CANCELADO</div>
                          <div className="text-xs text-neutral-500">
                            {fmtDateTime(payment.cancelledAt)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-green-600">ACTIVO</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Link href={`/receipts/payment/${payment.id}`} target="_blank">
                        <Button size="sm" variant="outline">
                          Ver Recibo
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
