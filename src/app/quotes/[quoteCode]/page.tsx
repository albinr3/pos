/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation"

import { prisma } from "@/lib/db"
import { formatRD } from "@/lib/money"
import { PrintToolbar } from "@/components/app/print-toolbar"
import { QuoteShareButton } from "@/components/app/quote-share-button"

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-DO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d))
}

export default async function QuotePage({
  params,
}: {
  params: Promise<{ quoteCode: string }>
}) {
  const { quoteCode } = await params

  const [company, quote] = await Promise.all([
    prisma.companySettings.findUnique({ where: { id: "company" } }),
    prisma.quote.findUnique({
      where: { quoteCode },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
        user: {
          select: { name: true },
        },
      },
    }),
  ])

  if (!quote) return notFound()

  const logoUrl = company?.logoUrl || "/movoLogo.png"

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

      <div className="no-print mb-6 flex items-center justify-between">
        <PrintToolbar />
        <QuoteShareButton quoteCode={quoteCode} customerPhone={quote.customer?.phone} />
      </div>
      <div className="no-print mb-6 text-sm text-neutral-600">Cotización {quote.quoteCode}</div>

      <header className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          {logoUrl && (
            <div className="max-h-16 w-auto overflow-hidden">
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
          <div className="text-2xl font-bold">COTIZACIÓN</div>
          <div className="mt-2 text-sm">
            <div>
              <span className="font-semibold">No:</span> {quote.quoteCode}
            </div>
            <div>
              <span className="font-semibold">Fecha:</span> {fmtDate(quote.quotedAt)}
            </div>
            {quote.validUntil && (
              <div>
                <span className="font-semibold">Válida hasta:</span> {fmtDate(quote.validUntil)}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mt-8 rounded-md border p-4">
        <div className="text-sm">
          <span className="font-semibold">Cliente:</span> {quote.customer?.name ?? "Cliente"}
          {quote.customer?.phone && (
            <>
              <br />
              <span className="font-semibold">Teléfono:</span> {quote.customer.phone}
            </>
          )}
          {quote.customer?.address && (
            <>
              <br />
              <span className="font-semibold">Dirección:</span> {quote.customer.address}
            </>
          )}
        </div>
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
          {quote.items.map((it) => (
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
          {quote.notes && (
            <>
              <div className="font-semibold">Notas</div>
              <div className="mt-1">{quote.notes}</div>
            </>
          )}
          <div className="mt-4 font-semibold">Precios incluyen ITBIS.</div>
          <div className="mt-2">Gracias por su interés</div>
          {quote.user && (
            <div className="mt-4 text-xs text-neutral-500">Preparado por: {quote.user.name}</div>
          )}
        </div>

        <div className="ml-auto w-full max-w-sm rounded-md border p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span>{formatRD(quote.subtotalCents)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>ITBIS (18% incluido)</span>
            <span>{formatRD(quote.itbisCents)}</span>
          </div>
          {quote.shippingCents > 0 && (
            <div className="mt-1 flex items-center justify-between">
              <span>Flete</span>
              <span>{formatRD(quote.shippingCents)}</span>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-base font-bold">
            <span>Total</span>
            <span>{formatRD(quote.totalCents)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

