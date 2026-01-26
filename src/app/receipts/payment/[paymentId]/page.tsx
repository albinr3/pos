import { notFound } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { formatRD } from "@/lib/money"
import { DownloadReceiptPdfButton } from "@/components/app/download-receipt-pdf-button"
import { PrintButton } from "@/components/app/print-button"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-DO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>
}) {
  const { paymentId } = await params

  // Lazy import de Prisma para evitar inicialización durante el build
  const { prisma } = await import("@/lib/db")

  // Obtener usuario actual para filtrar por accountId
  const user = await getCurrentUser()
  if (!user) return notFound()

  const [company, payment] = await Promise.all([
    prisma.companySettings.findFirst({ 
      where: { accountId: user.accountId } 
    }),
    prisma.payment.findFirst({
      where: { 
        id: paymentId,
        // Verificar que el payment pertenece a una venta del mismo account
        ar: {
          sale: {
            accountId: user.accountId,
          },
        },
      },
      include: {
        ar: {
          include: {
            customer: true,
            sale: true,
          },
        },
        user: true,
        cancelledUser: { select: { name: true } },
      },
    }),
  ])

  if (!payment) return notFound()

  return (
    <div className="mx-auto w-[80mm] bg-white p-3 text-[12px] leading-4 text-black print-content">
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

      <div className="no-print mb-2 flex gap-2">
        <PrintButton />
        <DownloadReceiptPdfButton 
          filename={`recibo-pago-${payment.ar.sale.invoiceCode}`}
        />
      </div>

      <div className="text-center">
        {company?.logoUrl && (
          <div className="mb-2 flex justify-center">
            <div className="max-h-12 w-auto overflow-hidden">
              <img src={company.logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
            </div>
          </div>
        )}
        <div className="text-[14px] font-bold">{company?.name || "Mi Negocio"}</div>
        {company?.address && <div>{company.address}</div>}
        {company?.phone && <div>Tel: {company.phone}</div>}
      </div>

      {payment.cancelledAt && (
        <div className="my-2 border-2 border-red-500 bg-red-50 p-2 text-center">
          <div className="text-[14px] font-bold text-red-600">⚠️ RECIBO CANCELADO</div>
          <div className="text-[11px] text-red-600">
            Cancelado el {fmtDate(payment.cancelledAt)}
            {payment.cancelledUser && ` por ${payment.cancelledUser.name}`}
          </div>
        </div>
      )}

      <div className="my-2 border-t border-b border-dashed py-2">
        <div className="text-center font-bold">RECIBO DE PAGO</div>
        <div className="mt-2 flex justify-between">
          <span>Fecha:</span>
          <span>{fmtDate(payment.paidAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Factura:</span>
          <span className="font-semibold">{payment.ar.sale.invoiceCode}</span>
        </div>
        <div className="mt-1">
          <span className="font-semibold">Cliente:</span> {payment.ar.customer.name}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Monto pagado</span>
          <span className="font-semibold">{formatRD(payment.amountCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Método</span>
          <span className="font-semibold">{payment.method}</span>
        </div>
        <div className="flex justify-between">
          <span>Pendiente</span>
          <span className="font-semibold">{formatRD(payment.ar.balanceCents)}</span>
        </div>
      </div>

      {payment.note && (
        <div className="mt-2 border-t border-dashed pt-2 text-[11px] text-neutral-700">
          <div className="font-semibold">Nota</div>
          <div>{payment.note}</div>
        </div>
      )}

      <div className="mt-3 text-center">
        <div className="font-semibold">Gracias</div>
        <div className="text-[11px] text-neutral-700">Cajero: {payment.user.name}</div>
      </div>
    </div>
  )
}
