import { NextRequest, NextResponse } from "next/server"
import { getReceiptsReportForPDF, type ReceiptFilters } from "@/app/(app)/reports/receipts/actions"
import { formatRD } from "@/lib/money"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    
    const filters: ReceiptFilters = {
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      customerId: searchParams.get("customerId") || undefined,
      receiptCode: searchParams.get("receiptCode") || undefined,
      method: searchParams.get("method") || undefined,
      minAmount: searchParams.get("minAmount") ? parseFloat(searchParams.get("minAmount")!) : undefined,
      maxAmount: searchParams.get("maxAmount") ? parseFloat(searchParams.get("maxAmount")!) : undefined,
      includeCancelled: searchParams.get("includeCancelled") === "true",
    }

    const data = await getReceiptsReportForPDF(filters)

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

    // Generar HTML para el PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reporte de Recibos</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      font-size: 11px;
      line-height: 1.4;
    }
    
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #333;
      padding-bottom: 15px;
    }
    
    .header h1 {
      font-size: 20px;
      margin-bottom: 5px;
    }
    
    .header .company-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 3px;
    }
    
    .info-section {
      margin-bottom: 15px;
    }
    
    .info-section h3 {
      font-size: 12px;
      margin-bottom: 8px;
      color: #333;
      border-bottom: 1px solid #ddd;
      padding-bottom: 3px;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }
    
    .info-item {
      display: flex;
      justify-content: space-between;
    }
    
    .info-label {
      font-weight: bold;
      color: #555;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    
    .stat-card {
      background: #f5f5f5;
      padding: 10px;
      border-radius: 5px;
      text-align: center;
    }
    
    .stat-label {
      font-size: 10px;
      color: #666;
      margin-bottom: 5px;
    }
    
    .stat-value {
      font-size: 16px;
      font-weight: bold;
      color: #333;
    }
    
    .stat-value.success {
      color: #16a34a;
    }
    
    .stat-value.danger {
      color: #dc2626;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 10px;
    }
    
    th {
      background: #333;
      color: white;
      padding: 8px 5px;
      text-align: left;
      font-weight: bold;
    }
    
    td {
      padding: 6px 5px;
      border-bottom: 1px solid #ddd;
    }
    
    tr:nth-child(even) {
      background: #f9f9f9;
    }
    
    tr.cancelled {
      background: #fee;
    }
    
    .receipt-code {
      font-family: monospace;
      font-weight: bold;
    }
    
    .amount {
      text-align: right;
      font-weight: bold;
    }
    
    .status-active {
      color: #16a34a;
      font-weight: bold;
    }
    
    .status-cancelled {
      color: #dc2626;
      font-weight: bold;
    }
    
    .method-section {
      margin-top: 20px;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 5px;
    }
    
    .method-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 10px;
    }
    
    .method-item {
      padding: 10px;
      background: white;
      border-radius: 3px;
      border: 1px solid #ddd;
    }
    
    .method-name {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .method-amount {
      font-size: 13px;
      font-weight: bold;
      color: #16a34a;
    }
    
    .method-count {
      font-size: 9px;
      color: #666;
    }
    
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 9px;
      color: #666;
    }
    
    @media print {
      body {
        padding: 10px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>REPORTE DE RECIBOS</h1>
    <div class="company-name">${data.company?.name || "Mi Negocio"}</div>
    ${data.company?.address ? `<div>${data.company.address}</div>` : ""}
    ${data.company?.phone ? `<div>Tel: ${data.company.phone}</div>` : ""}
  </div>
  
  <div class="info-section">
    <h3>Información del Reporte</h3>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Generado por:</span>
        <span>${data.generatedBy}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Fecha de generación:</span>
        <span>${fmtDateTime(data.generatedAt)}</span>
      </div>
      ${data.filters.startDate ? `
      <div class="info-item">
        <span class="info-label">Desde:</span>
        <span>${data.filters.startDate}</span>
      </div>
      ` : ""}
      ${data.filters.endDate ? `
      <div class="info-item">
        <span class="info-label">Hasta:</span>
        <span>${data.filters.endDate}</span>
      </div>
      ` : ""}
    </div>
  </div>
  
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total Recibos</div>
      <div class="stat-value">${data.stats.totalPayments}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Monto Total</div>
      <div class="stat-value success">${formatRD(data.stats.totalAmount)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Cancelados</div>
      <div class="stat-value danger">${data.stats.cancelledPayments}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Monto Cancelado</div>
      <div class="stat-value danger">${formatRD(data.stats.cancelledAmount)}</div>
    </div>
  </div>
  
  ${Object.keys(data.stats.byMethod).length > 0 ? `
  <div class="method-section">
    <h3>Por Método de Pago</h3>
    <div class="method-grid">
      ${Object.entries(data.stats.byMethod).map(([method, methodData]) => `
        <div class="method-item">
          <div class="method-name">${method}</div>
          <div class="method-amount">${formatRD(methodData.total)}</div>
          <div class="method-count">${methodData.count} recibos</div>
        </div>
      `).join("")}
    </div>
  </div>
  ` : ""}
  
  <table>
    <thead>
      <tr>
        <th>Recibo</th>
        <th>Fecha</th>
        <th>Cliente</th>
        <th>Factura</th>
        <th style="text-align: right;">Monto</th>
        <th>Método</th>
        <th>Cajero</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${data.payments.map(p => `
        <tr ${p.cancelledAt ? 'class="cancelled"' : ""}>
          <td class="receipt-code">${p.receiptCode}</td>
          <td>${fmtDate(p.paidAt)}</td>
          <td>${p.ar.customer.name}</td>
          <td class="receipt-code">${p.ar.sale.invoiceCode}</td>
          <td class="amount">${formatRD(p.amountCents)}</td>
          <td>${p.method}</td>
          <td>${p.user.name}</td>
          <td class="${p.cancelledAt ? 'status-cancelled' : 'status-active'}">
            ${p.cancelledAt ? 'CANCELADO' : 'ACTIVO'}
          </td>
        </tr>
      `).join("")}
    </tbody>
  </table>
  
  <div class="footer">
    <p>Reporte generado el ${fmtDateTime(data.generatedAt)} por ${data.generatedBy}</p>
    <p>Total de registros: ${data.payments.length}</p>
  </div>
</body>
</html>
    `

    // Retornar HTML que el navegador convertirá a PDF
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    })
  } catch (error) {
    console.error("Error generating PDF:", error)
    return NextResponse.json(
      { error: "Error al generar el PDF" },
      { status: 500 }
    )
  }
}
