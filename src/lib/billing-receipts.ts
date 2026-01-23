/**
 * Sistema de recibos de billing
 * 
 * Genera recibos internos (sin NCF) para pagos confirmados
 */

import { prisma } from "@/lib/db"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import type { BillingPayment, BillingProfile, BillingReceipt } from "@prisma/client"

// ==========================================
// RECEIPT GENERATION
// ==========================================

/**
 * Genera el próximo número de recibo
 */
async function getNextReceiptNumber(): Promise<string> {
  const lastReceipt = await prisma.billingReceipt.findFirst({
    orderBy: { receiptNumber: "desc" },
  })

  let nextNumber = 1
  if (lastReceipt?.receiptNumber) {
    const match = lastReceipt.receiptNumber.match(/REC-(\d+)/)
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1
    }
  }

  return `REC-${String(nextNumber).padStart(5, "0")}`
}

/**
 * Crea un recibo para un pago
 */
export async function createReceipt(
  paymentId: string,
  profile: BillingProfile
): Promise<BillingReceipt> {
  const receiptNumber = await getNextReceiptNumber()

  const receipt = await prisma.billingReceipt.create({
    data: {
      paymentId,
      receiptNumber,
      legalName: profile.legalName,
      taxId: profile.taxId,
      address: profile.address,
    },
  })

  return receipt
}

/**
 * Obtiene un recibo por ID
 */
export async function getReceipt(
  receiptId: string
): Promise<(BillingReceipt & { payment: BillingPayment }) | null> {
  return prisma.billingReceipt.findUnique({
    where: { id: receiptId },
    include: { payment: true },
  })
}

/**
 * Obtiene un recibo por número
 */
export async function getReceiptByNumber(
  receiptNumber: string
): Promise<(BillingReceipt & { payment: BillingPayment }) | null> {
  return prisma.billingReceipt.findUnique({
    where: { receiptNumber },
    include: { payment: true },
  })
}

/**
 * Lista recibos de un account
 */
export async function listReceipts(
  accountId: string
): Promise<(BillingReceipt & { payment: BillingPayment })[]> {
  const subscription = await prisma.billingSubscription.findUnique({
    where: { accountId },
  })

  if (!subscription) return []

  return prisma.billingReceipt.findMany({
    where: {
      payment: { subscriptionId: subscription.id },
    },
    include: { payment: true },
    orderBy: { issuedAt: "desc" },
  })
}

// ==========================================
// RECEIPT HTML GENERATION
// ==========================================

export function generateReceiptHtml(
  receipt: BillingReceipt & { payment: BillingPayment },
  companyName: string
): string {
  const { payment } = receipt
  const amount = payment.amountCents / 100
  const currencySymbol = payment.currency === "USD" ? "$" : "RD$"
  const formattedAmount =
    payment.currency === "USD"
      ? `${currencySymbol}${amount.toFixed(2)}`
      : `${currencySymbol}${amount.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Recibo ${receipt.receiptNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Arial, sans-serif; 
          line-height: 1.6; 
          color: #333;
          background: #f5f5f5;
          padding: 20px;
        }
        .receipt {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          color: white;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          font-size: 24px;
          margin-bottom: 5px;
        }
        .header .receipt-number {
          font-size: 14px;
          opacity: 0.9;
        }
        .content {
          padding: 30px;
        }
        .section {
          margin-bottom: 25px;
        }
        .section-title {
          font-size: 12px;
          text-transform: uppercase;
          color: #666;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }
        .section-content {
          font-size: 14px;
        }
        .amount-section {
          background: #f8fafc;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          margin: 20px 0;
        }
        .amount {
          font-size: 32px;
          font-weight: bold;
          color: #16a34a;
        }
        .amount-label {
          font-size: 12px;
          color: #666;
          margin-top: 5px;
        }
        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .footer {
          border-top: 1px solid #eee;
          padding: 20px 30px;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
        .badge {
          display: inline-block;
          background: #dcfce7;
          color: #16a34a;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }
        @media print {
          body { background: white; padding: 0; }
          .receipt { box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <div class="header">
          <h1>MOVOPos</h1>
          <div class="receipt-number">Recibo ${receipt.receiptNumber}</div>
        </div>
        
        <div class="content">
          <div class="amount-section">
            <div class="badge">PAGADO</div>
            <div class="amount">${formattedAmount}</div>
            <div class="amount-label">${payment.currency === "USD" ? "Dólares estadounidenses" : "Pesos dominicanos"}</div>
          </div>

          <div class="details-grid">
            <div class="section">
              <div class="section-title">Fecha de emisión</div>
              <div class="section-content">
                ${format(new Date(receipt.issuedAt), "d 'de' MMMM, yyyy", { locale: es })}
              </div>
            </div>

            <div class="section">
              <div class="section-title">Fecha de pago</div>
              <div class="section-content">
                ${payment.paidAt ? format(new Date(payment.paidAt), "d 'de' MMMM, yyyy", { locale: es }) : "-"}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Cliente</div>
            <div class="section-content">
              <strong>${receipt.legalName}</strong><br>
              ${receipt.taxId}<br>
              ${receipt.address}
            </div>
          </div>

          <div class="section">
            <div class="section-title">Concepto</div>
            <div class="section-content">
              Suscripción mensual MOVOPos - ${companyName}
              ${payment.periodStartsAt && payment.periodEndsAt ? `<br>
              <small style="color: #666;">
                Período: ${format(new Date(payment.periodStartsAt), "d MMM yyyy", { locale: es })} - 
                ${format(new Date(payment.periodEndsAt), "d MMM yyyy", { locale: es })}
              </small>` : ""}
            </div>
          </div>

          <div class="section">
            <div class="section-title">Método de pago</div>
            <div class="section-content">
              ${payment.provider === "LEMON" ? "Tarjeta de crédito/débito" : "Transferencia bancaria"}
              ${payment.reference ? `<br><small style="color: #666;">Ref: ${payment.reference}</small>` : ""}
            </div>
          </div>
        </div>

        <div class="footer">
          <p>Este es un recibo interno y no constituye un comprobante fiscal (NCF).</p>
          <p style="margin-top: 10px;">© ${new Date().getFullYear()} MOVOPos</p>
        </div>
      </div>
    </body>
    </html>
  `
}

// ==========================================
// EMAIL RECEIPT
// ==========================================

export async function sendReceiptEmail(
  receiptId: string,
  toEmail: string,
  companyName: string
): Promise<boolean> {
  const receipt = await getReceipt(receiptId)
  if (!receipt) return false

  const resendApiKey = process.env.RESEND_API_KEY
  const emailFrom = process.env.EMAIL_FROM || "facturacion@movopos.com"

  if (!resendApiKey) {
    console.log("RESEND_API_KEY not configured, skipping receipt email")
    return false
  }

  const html = generateReceiptHtml(receipt, companyName)

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: toEmail,
        subject: `Recibo de pago ${receipt.receiptNumber} - MOVOPos`,
        html,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("Failed to send receipt email:", error)
      return false
    }

    // Update emailSentAt
    await prisma.billingReceipt.update({
      where: { id: receiptId },
      data: { emailSentAt: new Date() },
    })

    return true
  } catch (error) {
    console.error("Error sending receipt email:", error)
    return false
  }
}
