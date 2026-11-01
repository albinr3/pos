import Link from "next/link"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getCashReceipt } from "@/lib/cash-shifts"
import type { CashClosingSnapshot } from "@/lib/cash-money"
import { shiftCollectionsByMethod, snapshotBreakdown, snapshotSalesSummary } from "@/lib/cash-money"
import { ShiftCollectionsSummary } from "@/components/app/shift-collections-summary"
import { formatRD } from "@/lib/money"
import { formatDateTimeDO } from "@/lib/date-time"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import { PrintButton } from "@/components/app/print-button"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"

export const dynamic = "force-dynamic"
export default async function CashShiftReceipt({ params, searchParams }: { params: Promise<{ shiftId: string }>; searchParams: Promise<{ autoprint?: string }> }) {
  const actor = await getCurrentUser()
  if (!actor) notFound()
  const { shiftId } = await params
  const shift = await getCashReceipt(actor, shiftId).catch(() => null)
  if (!shift || !shift.closedAt) notFound()
  const company = await prisma.companySettings.findUnique({ where: { accountId: actor.accountId }, select: { name: true, phone: true } })
  const snapshot = shift.closingSnapshot as unknown as CashClosingSnapshot
  const summary = snapshotSalesSummary(snapshot.documents)
  return <main className="print-content mx-auto w-[80mm] bg-white p-3 text-sm text-black">
    <style>{`@page { size: 80mm auto; margin: 0; } @media print { body { margin: 0; } .no-print { display: none !important; } }`}</style>
    <AutoPrintOnLoad enabled={(await searchParams).autoprint === "1"} />
    <div className="no-print mb-4 flex items-center justify-between"><PrintButton /><Link href="/daily-close" className="underline">Volver a caja</Link></div>
    <header className="mb-4 text-center"><h1 className="font-bold">{company?.name ?? "Cierre de caja"}</h1><p>Comprobante de cierre de turno</p>{company?.phone && <p>{company.phone}</p>}</header>
    <div className="space-y-1 border-b pb-3"><p>Responsable: <strong>{shift.cashierName}</strong></p><p>Apertura: {formatDateTimeDO(shift.openedAt)}</p><p>Cierre: {formatDateTimeDO(shift.closedAt)}</p><p className="break-all text-xs">Turno: {shift.id}</p>{snapshot.emergency && <p>Cierre excepcional del dueño</p>}</div>
    <ShiftCollectionsSummary collections={shiftCollectionsByMethod(snapshot.movements)} compact />
    <h2 className="font-semibold">Efectivo entregado</h2>
    <dl className="my-3 grid grid-cols-2 gap-2"><dt>Efectivo recibido al abrir</dt><dd className="text-right">{formatRD(shift.openingCountedCents)}</dd><dt>Diferencia de efectivo al recibir</dt><dd className="text-right">{formatRD(shift.openingDifferenceCents)}</dd><dt>Efectivo esperado al cerrar</dt><dd className="text-right">{formatRD(shift.expectedClosingCents ?? 0)}</dd><dt>Efectivo contado al cerrar</dt><dd className="text-right">{formatRD(shift.countedClosingCents ?? 0)}</dd><dt className="font-bold">Diferencia de efectivo</dt><dd className="text-right font-bold">{formatRD(shift.closingDifferenceCents ?? 0)}</dd></dl>
    {shift.openingNote && <p className="mb-2 break-words">Recepción: {shift.openingNote}</p>}{shift.closingNote && <p className="mb-3 break-words">Cierre: {shift.closingNote}</p>}
    <div className="space-y-1 border-t py-3"><p>Ventas al contado: {formatRD(summary.cashSalesCents)}</p><p>Ventas a crédito: {formatRD(summary.creditSalesCents)}</p><p>Abonos recibidos: {formatRD(summary.collectionsCents)}</p></div>
    <h2 className="font-semibold">Neto por método y cuenta</h2>{snapshotBreakdown(snapshot.movements).map((item, index) => <p key={index} className="my-1 text-xs">{item.accountName} · {item.method ? getPaymentMethodLabel(item.method) : "Tesorería"}: {formatRD(item.totalCents)}</p>)}
    <h2 className="border-t pt-3 font-semibold">Movimientos del turno</h2>
    {snapshot.movements.map(m => <div key={m.id} className="border-b py-2"><p className="break-words">{m.reference}</p><div className="flex justify-between gap-2"><span className="text-xs">{m.method ? getPaymentMethodLabel(m.method) : "Tesorería"} · {m.treasuryAccount?.name}</span><span className="whitespace-nowrap">{formatRD(m.amountCents)}</span></div></div>)}
    <p className="mt-4 text-xs">Este comprobante conserva los importes registrados al cerrar el turno.</p>
  </main>
}
