import { purchaseSummaryLabels, purchaseFilterDescription } from "@/lib/purchase-report-labels"
import type { PurchaseReport } from "@/lib/purchase-reports"
import { formatRD } from "@/lib/money"
import { PurchaseError } from "@/lib/purchase-credit"

export async function purchaseReportResponse(report: PurchaseReport, format: string) {
  const values = report.data.map(row => report.columns.map(c => c.type === "money" ? Number(row[c.key] ?? 0) / 100 : row[c.key] ?? ""))
  const summary = Object.entries(report.summary).map(([key, value]) => [purchaseSummaryLabels[key] || key, key.endsWith("Cents") ? value / 100 : value])
  if (format === "xlsx") {
    const XLSX = await import("xlsx")
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([[report.title], ["Saldos actuales · Importes en RD$"], ["Generado", report.generatedAt], ["Filtros", purchaseFilterDescription(report.filters)], [], report.columns.map(c => c.label), ...values, [], ["Resumen"], ...summary])
    sheet["!cols"] = report.columns.map(() => ({ wch: 24 }))
    for (let r = 6; r < 6 + values.length; r++) report.columns.forEach((c, col) => { const cell = sheet[XLSX.utils.encode_cell({ r, c: col })]; if (cell && c.type === "money") cell.z = '#,##0.00' })
    XLSX.utils.book_append_sheet(workbook, sheet, "Reporte")
    if (report.providers.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Proveedor", "Total original RD$", "Pendiente actual RD$"], ...report.providers.map(p => [p.name, p.totalCents / 100, p.balanceCents / 100])]), "Por proveedor")
    return new Response(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="reporte-proveedores.xlsx"', "Cache-Control": "no-store" } })
  }
  if (format === "pdf") {
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")
    const doc = new jsPDF({ orientation: "landscape" })
    doc.setFontSize(16); doc.text(report.title, 14, 15)
    doc.setFontSize(9); doc.text(`Saldos actuales · Importes RD$ · ${report.generatedAt}`, 14, 22)
    const filterLines = doc.splitTextToSize(`Filtros: ${purchaseFilterDescription(report.filters)}`, 265)
    doc.text(filterLines, 14, 28)
    autoTable(doc, { startY: 31 + filterLines.length * 4, head: [report.columns.map(c => c.label)], body: report.data.map(row => report.columns.map(c => c.type === "money" ? formatRD(Number(row[c.key] ?? 0)) : String(row[c.key] ?? ""))), styles: { fontSize: 7, overflow: "linebreak" } })
    doc.addPage(); doc.setFontSize(14); doc.text("Resumen del reporte", 14, 16)
    autoTable(doc, { startY: 23, head: [["Concepto", "Total"]], body: Object.entries(report.summary).map(([key, value]) => [purchaseSummaryLabels[key] || key, key.endsWith("Cents") ? formatRD(value) : String(value)]) })
    if (report.providers.length) { doc.addPage(); doc.text("Resumen por proveedor", 14, 16); autoTable(doc, { startY: 23, head: [["Proveedor", "Total original", "Pendiente actual"]], body: report.providers.map(p => [p.name, formatRD(p.totalCents), formatRD(p.balanceCents)]) }) }
    return new Response(new Uint8Array(doc.output("arraybuffer")), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="reporte-proveedores.pdf"', "Cache-Control": "no-store" } })
  }
  throw new PurchaseError("INVALID_FORMAT", "Usa format=json, xlsx o pdf")
}
