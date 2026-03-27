/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { formatDateDO, formatDateTimeDO } from "@/lib/date-time"
import { formatRD } from "@/lib/money"
import { formatPaymentWithBank } from "@/lib/payment-methods"
import { PrintButton } from "@/components/app/print-button"
import { PaymentMethod } from "@prisma/client"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"

// Evitar prerender y forzar evaluación dinámica (requiere autenticación y DB)
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
  return formatDateTimeDO(d)
}

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceCode: string }>
  searchParams: Promise<{ autoprint?: string }>
}) {
  // Lazy import de Prisma para evitar inicialización durante el build
  const { prisma } = await import("@/lib/db")

  const { invoiceCode } = await params
  const sp = await searchParams
  const shouldAutoPrint = sp.autoprint === "1"

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
        items: {
          include: { product: true, recipeAdjustments: true },
        },
        cancelledUser: { select: { name: true } },
        payments: true,
        ar: true,
      },
    }),
  ])

  if (!sale) return notFound()

  const logoUrl = company?.logoUrl
  const paymentMethod = sale.paymentMethod
  // Asegurarse de que payments esté disponible
  const saleWithPayments = sale as typeof sale & {
    payments?: Array<{ id: string; method: PaymentMethod; amountCents: number; transferBankName?: string | null }>
  }
  const splitPayments = saleWithPayments.payments ?? []
  const itbisModeLabel = sale.salePricesIncludeItbis ? "incluido" : "no incluido"
  const uniqueItbisRates = Array.from(new Set(sale.items.map((item) => item.itbisRateBp ?? (company?.itbisRateBp ?? 1800))))
  const itbisLabel = uniqueItbisRates.length === 1
    ? `ITBIS (${(uniqueItbisRates[0] / 100).toFixed(2)}% ${itbisModeLabel})`
    : `ITBIS (${itbisModeLabel})`

  function formatSaleType(type: string) {
    return type === "CREDITO" ? "Credito" : "Contado"
  }

  return (
    <div className="mx-auto max-w-[850px] bg-white p-10 text-black print-content">
      <AutoPrintOnLoad enabled={shouldAutoPrint} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
        `,
        }}
      />

      <div className="no-print mb-6 flex items-center justify-between">
        <div className="text-sm text-neutral-600">Factura {sale.invoiceCode}</div>
        <PrintButton />
      </div>

      {sale.cancelledAt && (
        <div className="mb-4 border-2 border-red-500 bg-red-50 p-4 text-center">
          <div className="text-xl font-bold text-red-600">⚠️ FACTURA CANCELADA</div>
          <div className="mt-1 text-sm text-red-600">
            Cancelada el {fmtDate(sale.cancelledAt)}
            {sale.cancelledUser && ` por ${sale.cancelledUser.name}`}
          </div>
        </div>
      )}

      <header className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          {logoUrl && (
            <div className="max-h-20 w-auto overflow-hidden">
              {/* Using <img> keeps local placeholder simple and avoids Next/Image constraints in print mode */}
              <img src={logoUrl} alt="Logo" className="h-20 w-auto object-contain" />
            </div>
          )}
          <div>
            <div className="text-xl font-bold">{company?.name || "Mi Negocio"}</div>
            {company?.address && <div className="text-sm">{company.address}</div>}
            {company?.phone && <div className="text-sm">Tel: {company.phone}</div>}
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xl font-bold">FACTURA</div>
          <div className="mt-2 text-sm">
            <div>
              <span className="font-semibold">No:</span> {sale.invoiceCode}
            </div>
            <div>
              <span className="font-semibold">Fecha:</span> {fmtDate(sale.soldAt)}
            </div>
          </div>
        </div>
      </header>

      <div className="mt-8 rounded-md border p-4">
        <div className="text-sm">
          <span className="font-semibold">Cliente:</span> {sale.customer?.name ?? "Cliente"}
        </div>
        {sale.customer?.address && (
          <div className="mt-2 text-sm">
            <span className="font-semibold">Dirección:</span> {sale.customer.address}
          </div>
        )}
        {sale.customer?.province && (
          <div className="mt-2 text-sm">
            <span className="font-semibold">Provincia:</span> {sale.customer.province}
          </div>
        )}
        <div className="mt-2 text-sm">
          <span className="font-semibold">Tipo de venta:</span> {formatSaleType(sale.type)}
        </div>
        {sale.type === "CONTADO" && (
          <div className="mt-2 text-sm">
            {splitPayments && splitPayments.length > 0 ? (
              <div>
                <span className="font-semibold">Métodos de pago:</span>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  {splitPayments.map((p) => (
                    <li key={p.id}>
                      {formatPaymentWithBank(p.method, p.transferBankName)} — {formatRD(p.amountCents)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : paymentMethod ? (
              <div>
                <span className="font-semibold">Método de pago:</span>{" "}
                {formatPaymentWithBank(paymentMethod, sale.transferBankName)}
              </div>
            ) : null}
          </div>
        )}
        {sale.type === "CREDITO" && sale.ar && sale.ar.dueDate && (
          <div className="mt-2 rounded-md bg-amber-50 p-3 text-sm border border-amber-200">
            <div className="font-semibold text-amber-900">⏰ Venta a Crédito</div>
            <div className="mt-1 text-amber-800">
              <span className="font-semibold">Fecha de vencimiento:</span>{" "}
              {formatDateDO(sale.ar.dueDate, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              })}
            </div>
          </div>
        )}
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left">Código</th>
            <th className="py-2 text-left">Descripción</th>
            <th className="py-2 text-left">Referencia</th>
            <th className="py-2 text-right">Cant.</th>
            <th className="py-2 text-right">Precio</th>
            <th className="py-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it) => (
            <tr key={it.id} className="border-b align-top">
              <td className="py-2 pr-2">{it.product.sku ?? "—"}</td>
              <td className="py-2 pr-2">
                <div>{it.product.name}</div>
                {it.recipeAdjustments.length > 0 && (
                  <div className="mt-1 text-xs text-neutral-700">
                    Ajustes:{" "}
                    {it.recipeAdjustments
                      .map((adjustment) => `${adjustment.type === "SIN" ? "Sin" : "Extra"} ${adjustment.ingredientName}`)
                      .join(", ")}
                  </div>
                )}
              </td>
              <td className="py-2 pr-2">{it.product.reference ?? "—"}</td>
              <td className="py-2 text-right">{decimalToNumber(it.qty)}</td>
              <td className="py-2 text-right">{formatRD(it.unitPriceCents)}</td>
              <td className="py-2 text-right">{formatRD(it.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="text-sm text-neutral-700">
          <div className="font-semibold">Nota</div>
          <div>{sale.salePricesIncludeItbis ? "Precios con ITBIS incluido." : "Precios con ITBIS no incluido."}</div>
          <div className="mt-4 font-semibold">Gracias por su compra</div>
        </div>

        <div className="ml-auto w-full max-w-sm rounded-md border p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span>{formatRD((company?.showItbisOnReceipts ?? true) ? sale.subtotalCents : (sale.subtotalCents + sale.itbisCents))}</span>
          </div>
          {(company?.showItbisOnReceipts ?? true) && (
            <div className="mt-1 flex items-center justify-between">
              <span>{itbisLabel}</span>
              <span>{formatRD(sale.itbisCents)}</span>
            </div>
          )}
          {sale.shippingCents > 0 && (
            <div className="mt-1 flex items-center justify-between">
              <span>Flete</span>
              <span>{formatRD(sale.shippingCents)}</span>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-base font-bold">
            <span>Total</span>
            <span>{formatRD(sale.totalCents)}</span>
          </div>
        </div>
      </div>

      {sale.type === "CREDITO" && (
        <div className="mt-12 pt-6">
          <div className="mx-auto w-full max-w-md text-center">
            <div className="border-t border-black" />
            <div className="mt-2 text-sm font-medium">Firma del cliente</div>
          </div>
        </div>
      )}
    </div>
  )
}
