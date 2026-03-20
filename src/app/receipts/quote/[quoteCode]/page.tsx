import { notFound } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { formatDateTimeDO } from "@/lib/date-time"
import { formatRD } from "@/lib/money"
import { formatQty } from "@/lib/units"
import { PrintButton } from "@/components/app/print-button"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

function fmtDate(d: Date) {
  return formatDateTimeDO(d)
}

export default async function QuoteReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteCode: string }>
  searchParams: Promise<{ autoprint?: string }>
}) {
  const { quoteCode } = await params
  const sp = await searchParams
  const shouldAutoPrint = sp.autoprint === "1"

  // Lazy import de Prisma para evitar inicialización durante el build
  const { prisma } = await import("@/lib/db")

  // Obtener usuario actual para filtrar por accountId
  const user = await getCurrentUser()
  if (!user) return notFound()

  const [company, quote] = await Promise.all([
    prisma.companySettings.findFirst({
      where: { accountId: user.accountId }
    }),
    prisma.quote.findFirst({
      where: {
        accountId: user.accountId,
        quoteCode
      },
      include: {
        customer: true,
        items: { include: { product: true, recipeAdjustments: true } },
        user: { select: { name: true } },
      },
    }),
  ])

  if (!quote) return notFound()
  const itbisModeLabel = quote.salePricesIncludeItbis ? "incluido" : "no incluido"
  const uniqueItbisRates = Array.from(new Set(quote.items.map((item) => item.itbisRateBp ?? (company?.itbisRateBp ?? 1800))))
  const itbisLabel = uniqueItbisRates.length === 1
    ? `ITBIS (${(uniqueItbisRates[0] / 100).toFixed(2)}% ${itbisModeLabel})`
    : `ITBIS (${itbisModeLabel})`

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

      <div className="no-print mb-2 flex items-center gap-2">
        <PrintButton />
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

      <div className="my-2 border-t border-b border-dashed py-2">
        <div className="text-center font-bold text-[18px]">COTIZACIÓN</div>
        <div className="mt-2 flex justify-between">
          <span>Cotización:</span>
          <span className="font-semibold">{quote.quoteCode}</span>
        </div>
        <div className="flex justify-between">
          <span>Fecha:</span>
          <span>{fmtDate(quote.quotedAt)}</span>
        </div>
        {quote.validUntil && (
          <div className="flex justify-between">
            <span>Válida hasta:</span>
            <span>{fmtDate(quote.validUntil)}</span>
          </div>
        )}
        <div className="mt-1">
          <span className="font-semibold">Cliente:</span> {quote.customer?.name ?? "Cliente"}
        </div>
      </div>

      <div className="space-y-2">
        {quote.items.map((it) => (
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
                {formatQty(Number(it.qty), it.product.unit)} x {formatRD(it.unitPriceCents)}
              </span>
              <span className="font-semibold">{formatRD(it.lineTotalCents)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRD(quote.subtotalCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>{itbisLabel}</span>
          <span>{formatRD(quote.itbisCents)}</span>
        </div>
        {quote.shippingCents > 0 && (
          <div className="flex justify-between">
            <span>Flete</span>
            <span>{formatRD(quote.shippingCents)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-dashed pt-2 text-[18px] font-bold">
          <span>TOTAL</span>
          <span>{formatRD(quote.totalCents)}</span>
        </div>
      </div>

      <div className="mt-4 pt-2 text-[14.5px] text-neutral-700">
        {quote.notes && (
          <div className="mb-2">
            <span className="font-semibold">Notas:</span> {quote.notes}
          </div>
        )}
        <div className="text-center font-semibold">
          {quote.salePricesIncludeItbis ? "Precios con ITBIS incluido." : "Precios con ITBIS no incluido."}
        </div>
      </div>

      <div className="mt-3 text-center">
        <div className="font-semibold">Gracias por su interés</div>
        <div className="text-[14px] text-neutral-700">Preparado por: {quote.user.name}</div>
      </div>
    </div>
  )
}
