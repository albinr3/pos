import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { listTreasuryAccounts } from "../../treasury/actions"
import { DebitNoteForm } from "./debit-form"

export const dynamic = "force-dynamic"
export default async function Page({ searchParams }: { searchParams: Promise<{ originalDocumentId?: string; noteId?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.isOwner && (!user.canAccessSales || !user.canAccessAccountsReceivable || !user.canPrepareFiscalDocuments)) redirect("/dashboard")
  const [settings, accounts, params] = await Promise.all([prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId } }), listTreasuryAccounts(), searchParams])
  // Una configuración existente puede estar apagada: no abrir el formulario por URL directa.
  if (settings?.enabled !== true) redirect("/dashboard")
  return <DebitNoteForm actor={{ id: user.id, accountId: user.accountId }} version={settings?.version ?? 0} initialOriginalId={params.originalDocumentId ?? ""} initialNoteId={params.noteId ?? ""} treasuryAccounts={accounts} />
}
