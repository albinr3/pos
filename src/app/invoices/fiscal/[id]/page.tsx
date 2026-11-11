import { notFound } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { hasPermission } from "@/lib/permissions"
import { getFiscalPrintable, printableText } from "@/lib/fiscal/core/printable"
import { AutoPrintOnLoad } from "@/components/app/auto-print-on-load"
import { PrintToolbar } from "@/components/app/print-toolbar"

export const dynamic = "force-dynamic"

export default async function FiscalPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string; autoprint?: string }> }) {
  const user = await getCurrentUser()
  if (!user) return notFound()
  const { id } = await params, options = await searchParams
  const document = await getFiscalPrintable(user, id).catch(() => null)
  if (!document) return notFound()
  const settings = document.saleId && hasPermission(user, "canPrepareFiscalDocuments") ? await prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId }, select: { enabled: true, configurationStatus: true, regime: true, environment: true, jurisdiction: true } }) : null
  const canPrepareNotes = Boolean(settings?.enabled && settings.configurationStatus === "VALIDATED" && settings.jurisdiction === "DO" && settings.regime === "DO_ECF" && settings.environment === "TEST" && ["E31", "E32", "E44", "E45", "E46"].includes(document.snapshot.type))
  const thermal = options.format !== "CARTA"
  return <main className={`mx-auto bg-white p-4 text-black print-content ${thermal ? "w-[80mm] text-sm" : "max-w-[850px] text-base"}`}>
    <AutoPrintOnLoad enabled={options.autoprint === "1"} />
    <style dangerouslySetInnerHTML={{ __html: `@media print {.no-print {display:none!important} body{margin:0}} ${thermal ? "@page{size:80mm auto;margin:0}" : ""}` }} />
    <div className="no-print"><PrintToolbar secondaryLink={{ href: `/invoices/fiscal/${encodeURIComponent(id)}?format=${thermal ? "CARTA" : "80mm"}`, label: thermal ? "Ver carta" : "Ver ticket" }} /><a className="underline" href={`/api/fiscal/documents/${encodeURIComponent(id)}/pdf`}>Descargar PDF</a>{canPrepareNotes && <div className="flex flex-wrap gap-3 py-2">{hasPermission(user, "canAccessReturns") && <Link className="rounded border px-3 py-2" href={`/fiscal/credit-notes?originalDocumentId=${encodeURIComponent(id)}`}>Crear nota de crédito</Link>}{hasPermission(user, "canAccessSales") && hasPermission(user, "canAccessAccountsReceivable") && <Link className="rounded border px-3 py-2" href={`/fiscal/debit-notes?originalDocumentId=${encodeURIComponent(id)}`}>Crear nota de débito</Link>}</div>}</div>
    {printableText(document).map((line, index) => <p key={index} className={index === 3 || line.startsWith("Total documentado:") ? "font-bold" : ""}>{line}</p>)}
  </main>
}
