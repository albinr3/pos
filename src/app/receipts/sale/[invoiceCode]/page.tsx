import { notFound } from "next/navigation"
import Link from "next/link"
import { PaymentMethod } from "@prisma/client"

import { getCurrentUser } from "@/lib/auth"
import { formatRD } from "@/lib/money"
import { formatPaymentWithBank } from "@/lib/payment-methods"
import { DownloadReceiptPdfButton } from "@/components/app/download-receipt-pdf-button"
import { PrintButton } from "@/components/app/print-button"
import { Button } from "@/components/ui/button"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

function decimalToNumber(decimal: unknown): number {
  if (typeof decimal === "number") return decimal
  if (typeof decimal === "string") return parseFloat(decimal)
  if (decimal && typeof decimal === "object" && "toNumber" in decimal) {
    return (decimal as { toNumber: () => number }).toNumber()
  }
  return 0
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-DO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export default async function SaleReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceCode: string }>
  searchParams: Promise<{ autoprint?: string }>
}) {
  const { invoiceCode } = await params
  const sp = await searchParams
  const shouldAutoPrint = sp.autoprint === "1"

  // Lazy import de Prisma para evitar inicialización durante el build
  const { prisma } = await import("@/lib/db")

  // Obtener usuario actual para filtrar por accountId
  const user = await getCurrentUser()
  if (!user) return notFound()

  const [company, sale] = await Promise.all([
    prisma.companySettings.findFirst({
      where: { accountId: user.accountId }
    }),
    prisma.sale.findFirst({
      where: {
        accountId: user.accountId,
        invoiceCode
      },
      include: {
        customer: true,
        items: { include: { product: true, recipeAdjustments: true } },
        cancelledUser: { select: { name: true } },
        payments: true,
        ar: true,
      },
    }),
  ])

  if (!sale) return notFound()

  const paymentMethod = sale.paymentMethod
  const saleWithPayments = sale as typeof sale & {
    payments?: Array<{ id: string; method: PaymentMethod; amountCents: number; transferBankName?: string | null }>
  }
  const splitPayments = saleWithPayments.payments ?? []

  function formatSaleType(type: string) {
    return type === "CREDITO" ? "Credito" : "Contado"
  }

  return (
    <div className="mx-auto w-[80mm] bg-white p-3 text-[15.5px] leading-4 text-black print-content">
      <AutoPrintOnLoad enabled={shouldAutoPrint} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @page { 
            size: 80mm auto; 
            margin: 0; 
          }
          @media print {
            body { margin: 0; }
            .no-print { display: none !important; }
            /* Configurado para papel térmico: 3 1/8" x 230 ft (80mm wide) */
          }
        `,
        }}
      />

      <div className="no-print mb-2 flex items-center justify-between">
        <div className="flex gap-2">
          <PrintButton />
          <DownloadReceiptPdfButton
            filename={`recibo-venta-${sale.invoiceCode}`}
          />
          <Button variant="outline" size="sm" asChild>
            <Link href={`/invoices/${sale.invoiceCode}`} target="_blank" rel="noopener noreferrer">
              Factura carta
            </Link>
          </Button>
        </div>
      </div>

      <div className="text-center">
        {company?.logoUrl && (
          <div className="mb-2 flex justify-center">
            <div className="max-h-14 w-auto overflow-hidden">
              <img src={company.logoUrl} alt="Logo" className="h-14 w-auto object-contain" />
            </div>
          </div>
        )}
        <div className="text-[18px] font-bold">{company?.name || "Mi Negocio"}</div>
        {company?.address && <div>{company.address}</div>}
        {company?.phone && <div>Tel: {company.phone}</div>}
      </div>

      {sale.cancelledAt && (
        <div className="my-2 border-2 border-red-500 bg-red-50 p-2 text-center">
          <div className="text-[18px] font-bold text-red-600">⚠️ FACTURA CANCELADA</div>
          <div className="text-[14.5px] text-red-600">
            Cancelada el {fmtDate(sale.cancelledAt)}
            {sale.cancelledUser && ` por ${sale.cancelledUser.name}`}
          </div>
        </div>
      )}

      <div className="my-2 border-t border-b border-dashed py-2">
        <div className="flex justify-between">
          <span>Factura:</span>
          <span className="font-semibold">{sale.invoiceCode}</span>
        </div>
        <div className="flex justify-between">
          <span>Fecha:</span>
          <span>{fmtDate(sale.soldAt)}</span>
        </div>
        <div className="mt-1">
          <span className="font-semibold">Cliente:</span> {sale.customer?.name ?? "Cliente"}
        </div>
        <div className="mt-1">
          <span className="font-semibold">Tipo de venta:</span> {formatSaleType(sale.type)}
        </div>
      </div>

      <div className="space-y-2">
        {sale.items.map((it) => (
          <div key={it.id} className="border-b border-dashed border-neutral-600 pb-2">
            <div className="font-semibold">{it.product.name}</div>
            <div className="text-[14.5px] text-neutral-700">Cod: {it.product.sku ?? "—"} · Ref: {it.product.reference ?? "—"}</div>
            {it.recipeAdjustments.length > 0 && (
              <div className="mt-1 text-[14px] text-neutral-700">
                Ajustes:{" "}
                {it.recipeAdjustments
                  .map((adjustment) => `${adjustment.type === "SIN" ? "Sin" : "Extra"} ${adjustment.ingredientName}`)
                  .join(", ")}
              </div>
            )}
            <div className="mt-1 flex justify-between">
              <span>
                {decimalToNumber(it.qty)} x {formatRD(it.unitPriceCents)}
              </span>
              <span className="font-semibold">{formatRD(it.lineTotalCents)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRD((company?.showItbisOnReceipts ?? true) ? sale.subtotalCents : (sale.subtotalCents + sale.itbisCents))}</span>
        </div>
        {(company?.showItbisOnReceipts ?? true) && (
          <div className="flex justify-between">
            <span>ITBIS (18% incluido)</span>
            <span>{formatRD(sale.itbisCents)}</span>
          </div>
        )}
        {sale.shippingCents > 0 && (
          <div className="flex justify-between">
            <span>Flete</span>
            <span>{formatRD(sale.shippingCents)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-dashed pt-2 text-[18px] font-bold">
          <span>TOTAL</span>
          <span>{formatRD(sale.totalCents)}</span>
        </div>
      </div>

      {sale.type === "CONTADO" && (
        <div className="mt-2 border-t border-dashed pt-2 text-[14.5px]">
          {splitPayments.length > 0 ? (
            <div>
              <span className="font-semibold">Pago:</span>{" "}
              {splitPayments.map((p, idx) => (
                <span key={p.id}>
                  {idx > 0 && " + "}
                  {formatPaymentWithBank(p.method, p.transferBankName)} {formatRD(p.amountCents)}
                </span>
              ))}
            </div>
          ) : paymentMethod ? (
            <div>
              <span className="font-semibold">Pago:</span>{" "}
              {formatPaymentWithBank(paymentMethod, sale.transferBankName)}
            </div>
          ) : null}
        </div>
      )}

      {sale.type === "CREDITO" && sale.ar && sale.ar.dueDate && (
        <div className="mt-2 border-t border-dashed pt-2">
          <div className="text-center">
            <div className="text-[14.5px] font-semibold">⏰ VENTA A CRÉDITO</div>
            <div className="text-[14.5px]">
              Vence: {new Intl.DateTimeFormat("es-DO", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(sale.ar.dueDate))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 text-center">
        <div className="font-semibold">Gracias por su compra</div>
      </div>
    </div>
  )
}
