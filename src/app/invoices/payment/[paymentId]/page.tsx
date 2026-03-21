import { notFound } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { formatDateTimeDO } from "@/lib/date-time"
import { formatRD } from "@/lib/money"
import { formatPaymentWithBank } from "@/lib/payment-methods"
import { PrintButton } from "@/components/app/print-button"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"

// Evitar prerender y forzar evaluación dinámica
export const dynamic = "force-dynamic"

function fmtDate(d: Date) {
  return formatDateTimeDO(d)
}

export default async function PaymentCartaPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>
  searchParams: Promise<{ autoprint?: string }>
}) {
  const { paymentId } = await params
  const sp = await searchParams
  const shouldAutoPrint = sp.autoprint === "1"

  // Lazy import de Prisma
  const { prisma } = await import("@/lib/db")

  const user = await getCurrentUser()
  if (!user) return notFound()

  const [company, payment] = await Promise.all([
    prisma.companySettings.findFirst({
      where: { accountId: user.accountId }
    }),
    prisma.payment.findFirst({
      where: {
        id: paymentId,
        ar: { sale: { accountId: user.accountId } },
      },
      include: {
        ar: {
          include: { customer: true, sale: true },
        },
        user: true,
        cancelledUser: { select: { name: true } },
      },
    }),
  ])

  if (!payment) return notFound()
  const receiptPayments = await prisma.payment.findMany({
    where: {
      receiptCode: payment.receiptCode,
      cancelledAt: null,
      ar: {
        sale: {
          accountId: user.accountId,
        },
      },
    },
    include: {
      ar: {
        include: { customer: true, sale: true },
      },
    },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
  })
  const visibleReceiptPayments = receiptPayments.length > 0 ? receiptPayments : [payment]
  const isBatchReceipt = visibleReceiptPayments.length > 1
  const totalReceiptCents = visibleReceiptPayments.reduce((sum, p) => sum + p.amountCents, 0)
  const totalRemainingCents = visibleReceiptPayments.reduce((sum, p) => sum + p.ar.balanceCents, 0)

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
        <div className="text-sm text-neutral-600">Recibo de pago {payment.receiptCode}</div>
        <PrintButton />
      </div>

      {payment.cancelledAt && (
        <div className="mb-4 border-2 border-red-500 bg-red-50 p-4 text-center">
          <div className="text-xl font-bold text-red-600">⚠️ RECIBO CANCELADO</div>
          <div className="mt-1 text-sm text-red-600">
            Cancelado el {fmtDate(payment.cancelledAt)}
            {payment.cancelledUser && ` por ${payment.cancelledUser.name}`}
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
          <div className="text-2xl font-bold">RECIBO DE PAGO</div>
          <div className="mt-2 text-sm">
            <div>
              <span className="font-semibold">No:</span> {payment.receiptCode}
            </div>
            <div>
              <span className="font-semibold">Fecha:</span> {fmtDate(payment.paidAt)}
            </div>
            {isBatchReceipt ? (
              <div className="mt-1">
                <span className="font-semibold">Facturas:</span> {visibleReceiptPayments.length}
              </div>
            ) : (
              <div className="mt-1">
                <span className="font-semibold">Factura:</span> {payment.ar.sale.invoiceCode}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mt-8 rounded-md border p-4">
        <div className="text-sm">
          <span className="font-semibold">Cliente:</span> {payment.ar.customer.name}
        </div>
        {payment.ar.customer.address && (
          <div className="mt-2 text-sm">
            <span className="font-semibold">Dirección:</span> {payment.ar.customer.address}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-md border p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-semibold text-neutral-500">
              {isBatchReceipt ? "Monto total pagado" : "Monto pagado"}
            </div>
            <div className="text-xl font-bold">{formatRD(isBatchReceipt ? totalReceiptCents : payment.amountCents)}</div>
          </div>
          <div>
            <div className="font-semibold text-neutral-500">Método de pago</div>
            <div className="text-lg">{formatPaymentWithBank(payment.method, payment.transferBankName)}</div>
          </div>
          <div>
            <div className="font-semibold text-neutral-500">
              {isBatchReceipt ? "Balance restante combinado" : "Balance restante en factura"}
            </div>
            <div className="text-lg">{formatRD(isBatchReceipt ? totalRemainingCents : payment.ar.balanceCents)}</div>
          </div>
        </div>
      </div>

      {isBatchReceipt && (
        <div className="mt-6 rounded-md border p-4">
          <div className="mb-3 text-sm font-semibold text-neutral-500">Desglose por factura</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left font-semibold">Factura</th>
                <th className="pb-2 text-right font-semibold">Monto aplicado</th>
              </tr>
            </thead>
            <tbody>
              {visibleReceiptPayments.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0">
                  <td className="py-2">{p.ar.sale.invoiceCode}</td>
                  <td className="py-2 text-right font-semibold">{formatRD(p.amountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 font-semibold">Total combinado</td>
                <td className="pt-3 text-right font-semibold">{formatRD(totalReceiptCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="text-sm text-neutral-700">
          {payment.note && (
            <>
              <div className="font-semibold">Nota</div>
              <div className="mt-1">{payment.note}</div>
            </>
          )}
          <div className="mt-4 font-semibold">Gracias por su pago</div>
          <div className="mt-1">Cajero: {payment.user.name}</div>
        </div>
      </div>
      
      <div className="mt-12 pt-6">
        <div className="mx-auto w-full max-w-md text-center">
          <div className="border-t border-black" />
          <div className="mt-2 text-sm font-medium">Firma del cliente</div>
        </div>
      </div>
    </div>
  )
}
