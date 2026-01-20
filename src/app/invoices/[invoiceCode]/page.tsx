/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation"
import { Decimal } from "@prisma/client/runtime/library"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { formatRD } from "@/lib/money"
import { PrintToolbar } from "@/components/app/print-toolbar"
import { PaymentMethod } from "@prisma/client"

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

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ invoiceCode: string }>
}) {
  const { invoiceCode } = await params

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
          include: { product: true },
        },
        cancelledUser: { select: { name: true } },
        payments: true,
      },
    }),
  ])

  if (!sale) return notFound()

  const logoUrl = company?.logoUrl
  const paymentMethod = sale.paymentMethod
  // Asegurarse de que payments esté disponible
  const saleWithPayments = sale as typeof sale & { payments?: Array<{ id: string; method: PaymentMethod; amountCents: number }> }
  const splitPayments = saleWithPayments.payments ?? []

  function formatPaymentMethod(method: PaymentMethod) {
    switch (method) {
      case "EFECTIVO":
        return "Efectivo"
      case "TRANSFERENCIA":
        return "Transferencia"
      case "TARJETA":
        return "Tarjeta"
      case "OTRO":
        return "Otro"
      default:
        return method
    }
  }

  return (
    <div className="mx-auto max-w-[850px] bg-white p-10 text-black print-content">
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

      <PrintToolbar />
      <div className="no-print mb-6 text-sm text-neutral-600">Factura {sale.invoiceCode}</div>

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
            <div className="max-h-16 w-auto overflow-hidden">
              {/* Using <img> keeps local placeholder simple and avoids Next/Image constraints in print mode */}
              <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
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
        {sale.type === "CONTADO" && (
          <div className="mt-2 text-sm">
            {splitPayments && splitPayments.length > 0 ? (
              <div>
                <span className="font-semibold">Métodos de pago:</span>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  {splitPayments.map((p) => (
                    <li key={p.id}>
                      {formatPaymentMethod(p.method)} — {formatRD(p.amountCents)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : paymentMethod ? (
              <div>
                <span className="font-semibold">Método de pago:</span>{" "}
                {formatPaymentMethod(paymentMethod)}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left">Descripción</th>
            <th className="py-2 text-left">Código</th>
            <th className="py-2 text-left">Referencia</th>
            <th className="py-2 text-right">Cant.</th>
            <th className="py-2 text-right">Precio</th>
            <th className="py-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it) => (
            <tr key={it.id} className="border-b align-top">
              <td className="py-2 pr-2">{it.product.name}</td>
              <td className="py-2 pr-2">{it.product.sku ?? "—"}</td>
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
          <div>Precios incluyen ITBIS.</div>
          <div className="mt-4 font-semibold">Gracias por su compra</div>
        </div>

        <div className="ml-auto w-full max-w-sm rounded-md border p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span>{formatRD(sale.subtotalCents)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>ITBIS (18% incluido)</span>
            <span>{formatRD(sale.itbisCents)}</span>
          </div>
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
    </div>
  )
}
