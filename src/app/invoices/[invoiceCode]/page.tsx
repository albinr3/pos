/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation"

import { prisma } from "@/lib/db"
import { formatRD } from "@/lib/money"
import { PrintToolbar } from "@/components/app/print-toolbar"
import { PaymentMethod } from "@prisma/client"

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

  const [company, sale] = await Promise.all([
    prisma.companySettings.findUnique({ where: { id: "company" } }),
    prisma.sale.findUnique({
      where: { invoiceCode },
      include: {
        customer: true,
        items: {
          include: { product: true },
        },
        cancelledUser: { select: { name: true } },
      },
    }),
  ])

  if (!sale) return notFound()

  const logoUrl = company?.logoUrl
  const paymentMethod = (sale as typeof sale & { paymentMethod: PaymentMethod | null }).paymentMethod

  return (
    <div className="mx-auto max-w-[850px] bg-white p-10 text-black">
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
            <div className="text-xl font-bold">{company?.name ?? "Tejada Auto Adornos"}</div>
            <div className="text-sm">{company?.address ?? "Carretera la Rosa, Moca"}</div>
            <div className="text-sm">Tel: {company?.phone ?? "829-475-1454"}</div>
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
        {sale.type === "CONTADO" && paymentMethod && (
          <div className="mt-2 text-sm">
            <span className="font-semibold">Método de pago:</span>{" "}
            {paymentMethod === "EFECTIVO"
              ? "Efectivo"
              : paymentMethod === "TRANSFERENCIA"
                ? "Transferencia"
                : paymentMethod === "TARJETA"
                  ? "Tarjeta"
                  : paymentMethod}
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
              <td className="py-2 text-right">{it.qty}</td>
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
