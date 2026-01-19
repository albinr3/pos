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

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>
}) {
  const { paymentId } = await params

  const [company, payment] = await Promise.all([
    prisma.companySettings.findUnique({ where: { id: "company" } }),
    prisma.payment.findUnique({
      where: { id: paymentId },
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

      <PrintToolbar />

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
