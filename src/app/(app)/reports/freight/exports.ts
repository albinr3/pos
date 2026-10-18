import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import { formatDateDO, formatDateTimeDO } from "@/lib/date-time"
import { formatRD } from "@/lib/money"
import type { FreightExportData } from "./model"

const HEADERS = ["Fecha", "Factura", "Cliente", "Tipo", "Flete (RD$)", "Total factura (RD$)"]

function csvCell(value: string) {
  // Escapar comillas y neutralizar fórmulas conserva nombres libres al abrir el CSV en Excel.
  const safe = /^\s*[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function freightExportFilename(data: FreightExportData, extension: "csv" | "pdf") {
  return `fletes_${data.filters.from}_${data.filters.to}.${extension}`
}

export function createFreightCSV(data: FreightExportData) {
  const rows = data.rows.map((row) => [
    formatDateDO(row.soldAt, { year: "numeric", month: "2-digit", day: "2-digit" }),
    row.invoiceCode, row.customerName, row.type === "CONTADO" ? "Contado" : "Crédito",
    (row.shippingCents / 100).toFixed(2), (row.totalCents / 100).toFixed(2),
  ])
  rows.push(["", "TOTAL FLETE", "", "", (data.summary.totalShippingCents / 100).toFixed(2), ""])
  // BOM UTF-8 y CRLF permiten que Excel conserve acentos y saltos de línea.
  return "\uFEFF" + [HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
}

export function createFreightPDF(data: FreightExportData) {
  const doc = new jsPDF()
  const width = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 16

  doc.setFont("helvetica", "bold")
  doc.setFontSize(17)
  doc.text("Reporte de fletes", margin, y)
  y += 7
  doc.setFontSize(11)
  const companyLines = doc.splitTextToSize(data.companyName, width - margin * 2)
  doc.text(companyLines, margin, y)
  y += companyLines.length * 5 + 3
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)

  const typeLabel = data.filters.type === "ALL" ? "Todos" : data.filters.type === "CONTADO" ? "Contado" : "Crédito"
  const metadata = [
    `Generado: ${formatDateTimeDO(data.generatedAt)} · Por: ${data.generatedBy}`,
    `Período: ${data.filters.from} al ${data.filters.to}`,
    `Cliente: ${data.customerLabel}`,
    `Tipo: ${typeLabel} · Factura: ${data.filters.invoiceCode || "Todas"}`,
    "Flete facturado: incluye ventas a crédito y no equivale a cobros o pagos a transportadoras.",
  ]
  for (const line of metadata) {
    const lines = doc.splitTextToSize(line, width - margin * 2)
    doc.text(lines, margin, y)
    y += lines.length * 4.5 + 1
  }

  y += 3
  doc.setFont("helvetica", "bold")
  doc.text(`Total flete: ${formatRD(data.summary.totalShippingCents)} · Facturas: ${data.summary.invoiceCount}`, margin, y)
  y += 5
  doc.setFont("helvetica", "normal")
  doc.text(`Contado: ${formatRD(data.summary.cashShippingCents)} · Crédito: ${formatRD(data.summary.creditShippingCents)}`, margin, y)

  autoTable(doc, {
    startY: y + 5,
    margin: { left: margin, right: margin, top: margin, bottom: 18 },
    head: [HEADERS],
    body: data.rows.map((row) => [
      formatDateDO(row.soldAt, { year: "numeric", month: "2-digit", day: "2-digit" }),
      row.invoiceCode, row.customerName, row.type === "CONTADO" ? "Contado" : "Crédito",
      formatRD(row.shippingCents), formatRD(row.totalCents),
    ]),
    foot: [["", "TOTAL FLETE", "", "", formatRD(data.summary.totalShippingCents), ""]],
    showFoot: "lastPage",
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [91, 44, 151] },
    footStyles: { fillColor: [91, 44, 151] },
    columnStyles: { 0: { cellWidth: 22 }, 3: { cellWidth: 18 }, 4: { halign: "right" }, 5: { halign: "right" } },
  })

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text(`Fletes facturados · Página ${page} de ${pages}`, margin, doc.internal.pageSize.getHeight() - 9)
  }
  return doc
}
