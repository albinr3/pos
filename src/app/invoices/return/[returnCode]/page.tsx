import { notFound } from "next/navigation"
import { Decimal } from "@prisma/client/runtime/library"

import { getCurrentUser } from "@/lib/auth"
import { formatDateTimeDO } from "@/lib/date-time"
import { formatRD } from "@/lib/money"
import { PrintButton } from "@/components/app/print-button"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"

// Evitar prerender y forzar evaluación dinámica
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

export default async function ReturnCartaPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ returnCode: string }>
  searchParams: Promise<{ autoprint?: string }>
}) {
  const { returnCode } = await params
  const sp = await searchParams
  const shouldAutoPrint = sp.autoprint === "1"

  // Lazy import de Prisma
  const { prisma } = await import("@/lib/db")

  const user = await getCurrentUser()
  if (!user) return notFound()

  const [company, returnRecord] = await Promise.all([
    prisma.companySettings.findFirst({
      where: { accountId: user.accountId }
    }),
    prisma.return.findFirst({
      where: {
        accountId: user.accountId,
        returnCode
      },
      include: {
        sale: { include: { customer: true } },
        user: { select: { name: true } },
        cancelledUser: { select: { name: true } },
        items: { include: { product: true } },
      },
    }),
  ])

  if (!returnRecord) return notFound()

  const logoUrl = company?.logoUrl

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
        <div className="text-sm text-neutral-600">Devolución {returnRecord.returnCode}</div>
        <PrintButton />
      </div>

      {returnRecord.cancelledAt && (
        <div className="mb-4 border-2 border-red-500 bg-red-50 p-4 text-center">
          <div className="text-xl font-bold text-red-600">⚠️ DEVOLUCIÓN CANCELADA</div>
          <div className="mt-1 text-sm text-red-600">
            Cancelada el {fmtDate(returnRecord.cancelledAt)}
            {returnRecord.cancelledUser && ` por ${returnRecord.cancelledUser.name}`}
          </div>
        </div>
      )}

      <header className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          {logoUrl && (
            <div className="max-h-20 w-auto overflow-hidden">
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
          <div className="text-2xl font-bold">DEVOLUCIÓN</div>
          <div className="mt-2 text-sm">
            <div>
              <span className="font-semibold">No:</span> {returnRecord.returnCode}
            </div>
            <div>
              <span className="font-semibold">Fecha:</span> {fmtDate(returnRecord.returnedAt)}
            </div>
            <div className="mt-1">
              <span className="font-semibold">Factura Original:</span> {returnRecord.sale.invoiceCode}
            </div>
          </div>
        </div>
      </header>

      <div className="mt-8 rounded-md border p-4">
        <div className="text-sm">
          <span className="font-semibold">Cliente:</span> {returnRecord.sale.customer?.name ?? "Cliente"}
        </div>
        {returnRecord.sale.customer?.address && (
          <div className="mt-2 text-sm">
            <span className="font-semibold">Dirección:</span> {returnRecord.sale.customer.address}
          </div>
        )}
        <div className="mt-2 text-sm">
          <span className="font-semibold">Usuario que procesó:</span> {returnRecord.user.name}
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left">Código</th>
            <th className="py-2 text-left">Descripción</th>
            <th className="py-2 text-right">Cant. Devuelta</th>
            <th className="py-2 text-right">Precio Unitario</th>
            <th className="py-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {returnRecord.items.map((it) => (
            <tr key={it.id} className="border-b align-top">
              <td className="py-2 pr-2">{it.product.sku ?? "—"}</td>
              <td className="py-2 pr-2">{it.product.name}</td>
              <td className="py-2 text-right">{decimalToNumber(it.qty)}</td>
              <td className="py-2 text-right">{formatRD(it.unitPriceCents)}</td>
              <td className="py-2 text-right">{formatRD(it.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="text-sm text-neutral-700">
          {returnRecord.notes && (
            <>
              <div className="font-semibold">Nota</div>
              <div className="mt-1">{returnRecord.notes}</div>
            </>
          )}
        </div>

        <div className="ml-auto w-full max-w-sm rounded-md border p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span>{formatRD(returnRecord.subtotalCents)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>ITBIS (18%)</span>
            <span>{formatRD(returnRecord.itbisCents)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-base font-bold">
            <span>Total Devuelto</span>
            <span>{formatRD(returnRecord.totalCents)}</span>
          </div>
        </div>
      </div>
      
      <div className="mt-12 pt-6">
        <div className="mx-auto w-full max-w-md text-center">
          <div className="border-t border-black" />
          <div className="mt-2 text-sm font-medium">Recibido conforme / Firma</div>
        </div>
      </div>
    </div>
  )
}
