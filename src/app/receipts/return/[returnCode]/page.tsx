import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { PrintToolbar } from "@/components/app/print-toolbar"
import { formatRD } from "@/lib/money"

function fmtDate(d: Date) {
  return format(d, "dd/MM/yyyy HH:mm", { locale: es })
}

export default async function ReturnReceiptPage({
  params,
}: {
  params: Promise<{ returnCode: string }>
}) {
  const { returnCode } = await params

  const [company, returnRecord] = await Promise.all([
    prisma.companySettings.findUnique({ where: { id: "company" } }),
    prisma.return.findUnique({
      where: { returnCode },
      include: {
        sale: {
          include: {
            customer: true,
          },
        },
        user: {
          select: {
            name: true,
          },
        },
        cancelledUser: {
          select: {
            name: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
    }),
  ])

  if (!returnRecord) return notFound()

  return (
    <div className="mx-auto w-[80mm] bg-white p-3 text-[12px] leading-4 text-black">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @page { size: 80mm auto; margin: 0; }
          @media print {
            body { margin: 0; }
            .no-print { display: none !important; }
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

      {returnRecord.cancelledAt && (
        <div className="my-2 border-2 border-red-500 bg-red-50 p-2 text-center">
          <div className="text-[14px] font-bold text-red-600">⚠️ DEVOLUCIÓN CANCELADA</div>
          <div className="text-[11px] text-red-600">
            Cancelada el {fmtDate(returnRecord.cancelledAt)}
            {returnRecord.cancelledUser && ` por ${returnRecord.cancelledUser.name}`}
          </div>
        </div>
      )}

      <div className="my-2 border-t border-b border-dashed py-2">
        <div className="text-center text-[14px] font-bold">DEVOLUCIÓN</div>
        <div className="flex justify-between">
          <span>Devolución:</span>
          <span className="font-semibold">{returnRecord.returnCode}</span>
        </div>
        <div className="flex justify-between">
          <span>Factura:</span>
          <span>{returnRecord.sale.invoiceCode}</span>
        </div>
        <div className="flex justify-between">
          <span>Fecha:</span>
          <span>{fmtDate(returnRecord.returnedAt)}</span>
        </div>
        <div className="mt-1">
          <span className="font-semibold">Cliente:</span> {returnRecord.sale.customer?.name ?? "Cliente"}
        </div>
        <div>
          <span className="font-semibold">Usuario:</span> {returnRecord.user.name}
        </div>
      </div>

      <div className="space-y-2">
        {returnRecord.items.map((item, idx) => (
          <div key={item.id} className="border-b border-dashed pb-1">
            <div className="flex justify-between">
              <span className="font-semibold">{item.product.name}</span>
            </div>
            <div className="flex justify-between text-[11px] text-gray-600">
              <span>
                {item.qty} x {formatRD(item.unitPriceCents)}
              </span>
              <span>{formatRD(item.lineTotalCents)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed pt-2">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatRD(returnRecord.subtotalCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>ITBIS (18%):</span>
          <span>{formatRD(returnRecord.itbisCents)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-dashed pt-1 text-[14px] font-bold">
          <span>TOTAL:</span>
          <span>{formatRD(returnRecord.totalCents)}</span>
        </div>
      </div>

      {returnRecord.notes && (
        <div className="my-2 border-t border-dashed pt-2 text-[11px]">
          <div className="font-semibold">Notas:</div>
          <div>{returnRecord.notes}</div>
        </div>
      )}

      <div className="mt-4 text-center text-[10px] text-gray-500">
        <div>Gracias por su preferencia</div>
      </div>
    </div>
  )
}





