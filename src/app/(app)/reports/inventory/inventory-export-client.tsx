"use client"

import { Button } from "@/components/ui/button"
import { FileSpreadsheet, FileText } from "lucide-react"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { formatRD } from "@/lib/money"

interface Product {
  id: string
  name: string
  sku: string | null
  supplier: { name: string } | null
  stock: number
  costCents: number
}

interface InventoryExportClientProps {
  products: Product[]
  totalInventoryCostCents: number
  count: number
}

export function InventoryExportClient({
  products,
  totalInventoryCostCents,
  count,
}: InventoryExportClientProps) {
  function exportToExcel() {
    // Preparar datos para Excel
    const excelData = products.map((product) => {
      const totalCostCents = product.costCents * product.stock
      return {
        Producto: product.name,
        SKU: product.sku || "-",
        Proveedor: product.supplier?.name || "-",
        Stock: product.stock,
        "Costo Unitario": product.costCents / 100,
        "Costo Total": totalCostCents / 100,
      }
    })

    // Agregar fila de total
    excelData.push({
      Producto: "TOTAL",
      SKU: "-",
      Proveedor: "-",
      Stock: products.reduce((sum, p) => sum + Number(p.stock), 0),
      "Costo Unitario": 0,
      "Costo Total": totalInventoryCostCents / 100,
    })

    // Crear workbook y worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)

    // Ajustar ancho de columnas
    ws["!cols"] = [
      { wch: 30 }, // Producto
      { wch: 15 }, // SKU
      { wch: 20 }, // Proveedor
      { wch: 10 }, // Stock
      { wch: 15 }, // Costo Unitario
      { wch: 15 }, // Costo Total
    ]

    // Agregar worksheet al workbook
    XLSX.utils.book_append_sheet(wb, ws, "Inventario")

    // Generar nombre de archivo con fecha
    const date = new Date().toISOString().split("T")[0]
    const fileName = `inventario_${date}.xlsx`

    // Descargar archivo
    XLSX.writeFile(wb, fileName)
  }

  function exportToPDF() {
    const doc = new jsPDF("landscape") // Usar orientación horizontal para más espacio

    // Título
    doc.setFontSize(18)
    doc.text("Reporte de Inventario", 14, 20)

    // Fecha
    doc.setFontSize(10)
    const date = new Date().toLocaleDateString("es-DO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    doc.text(`Fecha: ${date}`, 14, 28)

    // Preparar datos para la tabla
    const tableData = products.map((product) => {
      const totalCostCents = product.costCents * product.stock
      return [
        product.name,
        product.sku || "-",
        product.supplier?.name || "-",
        product.stock.toString(),
        formatRD(product.costCents),
        formatRD(totalCostCents),
      ]
    })

    // Agregar tabla con márgenes ajustados
    autoTable(doc, {
      startY: 35,
      margin: { left: 14, right: 14 },
      head: [["Producto", "SKU", "Proveedor", "Stock", "Costo Unitario", "Costo Total"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 50 }, // Producto - reducido
        1: { cellWidth: 25 }, // SKU - reducido
        2: { cellWidth: 35 }, // Proveedor - reducido
        3: { halign: "right", cellWidth: 18 }, // Stock - reducido
        4: { halign: "right", cellWidth: 28 }, // Costo Unitario - reducido
        5: { halign: "right", cellWidth: 28 }, // Costo Total - reducido
      },
      tableWidth: "auto",
    })

    // Agregar total al final
    const finalY = (doc as any).lastAutoTable?.finalY || 35
    doc.setFontSize(12)
    doc.setFont(undefined, "bold")
    doc.text(
      `Total de Inventario: ${formatRD(totalInventoryCostCents)} (${count} productos)`,
      14,
      finalY + 10,
    )

    // Generar nombre de archivo con fecha
    const dateStr = new Date().toISOString().split("T")[0]
    const fileName = `inventario_${dateStr}.pdf`

    // Descargar archivo
    doc.save(fileName)
  }

  return (
    <div className="flex gap-2">
      <Button onClick={exportToExcel} variant="outline" size="sm">
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Exportar a Excel
      </Button>
      <Button onClick={exportToPDF} variant="outline" size="sm">
        <FileText className="mr-2 h-4 w-4" />
        Exportar a PDF
      </Button>
    </div>
  )
}

