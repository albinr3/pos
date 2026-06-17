import { notFound } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { formatDateTimeDO } from "@/lib/date-time"
import { formatRD } from "@/lib/money"
import { formatPaymentWithBank } from "@/lib/payment-methods"
import { DownloadReceiptPdfButton } from "@/components/app/download-receipt-pdf-button"
import { PrintButton } from "@/components/app/print-button"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"

// Esta ruta existe porque el modulo de compras abre /receipts/purchase/{id}.
// Si se cambia el link de impresion, mantener esta ruta o crear una redireccion
// para evitar 404 en compras ya guardadas.
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

export default async function PurchaseReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ purchaseId: string }>
  searchParams: Promise<{ autoprint?: string }>
}) {
  const { purchaseId } = await params
  const sp = await searchParams
  const shouldAutoPrint = sp.autoprint === "1"

  // Lazy import para mantener el recibo fuera del prerender y filtrar por cuenta en runtime.
  const { prisma } = await import("@/lib/db")

  const user = await getCurrentUser()
  if (!user) return notFound()

  const [company, purchase] = await Promise.all([
    prisma.companySettings.findFirst({
      where: { accountId: user.accountId },
    }),
    prisma.purchase.findFirst({
      where: {
        id: purchaseId,
        accountId: user.accountId,
      },
      include: {
        items: { include: { product: true } },
        user: { select: { name: true, username: true } },
        cancelledUser: { select: { name: true, username: true } },
      },
    }),
  ])

  if (!purchase) return notFound()

  const subtotalCents = purchase.items.reduce((sum, item) => sum + item.unitCostCents * decimalToNumber(item.qty), 0)
  const discountCents = Math.max(0, subtotalCents - purchase.totalCents)
  const cashierName = purchase.user.name || purchase.user.username || "Usuario"
  const cancelledBy = purchase.cancelledUser
    ? purchase.cancelledUser.name || purchase.cancelledUser.username
    : null

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
            /* Recibo termico de compras: mantener el ancho alineado a los links /receipts/purchase/{id}. */
          }
        `,
        }}
      />

      <div className="no-print mb-2 flex gap-2">
        <PrintButton />
        <DownloadReceiptPdfButton filename={`recibo-compra-${purchase.id}`} />
      </div>

      <div className="text-center">
        {company?.logoUrl && (
          <div className="mb-2 flex justify-center">
            <div className="max-h-12 w-auto overflow-hidden">
              <img src={company.logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
            </div>
          </div>
        )}
        <div className="text-[18px] font-bold">{company?.name || "Mi Negocio"}</div>
        {company?.address && <div>{company.address}</div>}
        {company?.phone && <div>Tel: {company.phone}</div>}
      </div>

      {purchase.cancelledAt && (
        <div className="my-2 border-2 border-red-500 bg-red-50 p-2 text-center">
          <div className="text-[18px] font-bold text-red-600">COMPRA CANCELADA</div>
          <div className="text-[14.5px] text-red-600">
            Cancelada el {fmtDate(purchase.cancelledAt)}
            {cancelledBy && ` por ${cancelledBy}`}
          </div>
        </div>
      )}

      <div className="my-4 border-t border-b border-dashed py-3">
        <div className="text-center text-[18px] font-bold">RECIBO DE COMPRA</div>
        <div className="mt-3 flex justify-between">
          <span>Compra:</span>
          <span className="font-semibold">{purchase.id.slice(-8).toUpperCase()}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span>Fecha:</span>
          <span>{fmtDate(purchase.purchasedAt)}</span>
        </div>
        <div className="mt-2">
          <span className="font-semibold">Proveedor:</span> {purchase.supplierName || "Sin proveedor"}
        </div>
        {purchase.paymentMethod && (
          <div className="mt-1">
            <span className="font-semibold">Pago:</span> {formatPaymentWithBank(purchase.paymentMethod)}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {purchase.items.map((item) => {
          const qty = decimalToNumber(item.qty)
          return (
            <div key={item.id} className="border-b border-dashed border-neutral-600 pb-2">
              <div className="font-semibold">{item.product.name}</div>
              <div className="text-[14.5px] text-neutral-700">
                Cod: {item.product.sku ?? "-"} - Ref: {item.product.reference ?? "-"}
              </div>
              <div className="mt-1 flex justify-between">
                <span>
                  {qty} x {formatRD(item.unitCostCents)}
                </span>
                <span className="font-semibold">{formatRD(item.lineTotalCents)}</span>
              </div>
              {item.discountPercentBp > 0 && (
                <div className="mt-1 flex justify-between text-[14px] text-neutral-700">
                  <span>Desc. proveedor</span>
                  <span>{(item.discountPercentBp / 100).toFixed(2)}%</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-2 space-y-1">
        {discountCents > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>Descuento</span>
            <span>-{formatRD(discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRD(subtotalCents)}</span>
        </div>
        <div className="flex justify-between border-t border-dashed pt-2 text-[18px] font-bold">
          <span>TOTAL</span>
          <span>{formatRD(purchase.totalCents)}</span>
        </div>
      </div>

      {purchase.notes && (
        <div className="mt-4 border-t border-dashed pt-3 text-[14.5px] text-neutral-700">
          <div className="font-semibold">Nota</div>
          <div>{purchase.notes}</div>
        </div>
      )}

      <div className="mt-6 text-center">
        <div className="font-semibold">Compra registrada</div>
        <div className="text-[14.5px] text-neutral-700">Usuario: {cashierName}</div>
      </div>
    </div>
  )
}
