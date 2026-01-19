import { notFound } from "next/navigation"

import { prisma } from "@/lib/db"
import { formatRD } from "@/lib/money"
import { PrintToolbar } from "@/components/app/print-toolbar"

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
        items: { include: { product: true } },
        cancelledUser: { select: { name: true } },
      },
    }),
  ])

  if (!sale) return notFound()

  return (
    <div className="mx-auto w-[80mm] bg-white p-3 text-[12px] leading-4 text-black">
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

      <PrintToolbar secondaryLink={{ href: `/invoices/${sale.invoiceCode}`, label: "Ver carta" }} />

      <div className="text-center">
        {company?.logoUrl && (
          <div className="mb-2 flex justify-center">
            <div className="max-h-12 w-auto overflow-hidden">
              <img src={company.logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
            </div>
          </div>
        )}
        <div className="text-[14px] font-bold">{company?.name ?? "Tejada Auto Adornos"}</div>
        <div>{company?.address ?? "Carretera la Rosa, Moca"}</div>
        <div>Tel: {company?.phone ?? "829-475-1454"}</div>
      </div>

      {sale.cancelledAt && (
        <div className="my-2 border-2 border-red-500 bg-red-50 p-2 text-center">
          <div className="text-[14px] font-bold text-red-600">⚠️ FACTURA CANCELADA</div>
          <div className="text-[11px] text-red-600">
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
      </div>

      <div className="space-y-2">
        {sale.items.map((it) => (
          <div key={it.id} className="border-b border-dashed pb-2">
            <div className="font-semibold">{it.product.name}</div>
            <div className="text-[11px] text-neutral-700">Cod: {it.product.sku ?? "—"} · Ref: {it.product.reference ?? "—"}</div>
            <div className="mt-1 flex justify-between">
              <span>
                {it.qty} x {formatRD(it.unitPriceCents)}
              </span>
              <span className="font-semibold">{formatRD(it.lineTotalCents)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRD(sale.subtotalCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>ITBIS (18% incluido)</span>
          <span>{formatRD(sale.itbisCents)}</span>
        </div>
        {sale.shippingCents > 0 && (
          <div className="flex justify-between">
            <span>Flete</span>
            <span>{formatRD(sale.shippingCents)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-dashed pt-2 text-[14px] font-bold">
          <span>TOTAL</span>
          <span>{formatRD(sale.totalCents)}</span>
        </div>
      </div>

      <div className="mt-3 text-center">
        <div className="font-semibold">Gracias por su compra</div>
      </div>
    </div>
  )
}
