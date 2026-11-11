import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { listTreasuryAccounts } from "../../treasury/actions"
import { FiscalCreditForm } from "../../returns/fiscal-credit-form"
import { resolveFiscalPolicy } from "@/lib/fiscal/core/policy"

export const dynamic = "force-dynamic"
export default async function Page({ searchParams }: { searchParams: Promise<{ originalDocumentId?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.isOwner && (!user.canAccessReturns || !user.canPrepareFiscalDocuments)) redirect("/dashboard")
  // La URL directa tampoco debe abrir operaciones fiscales cuando la cuenta las desactivó.
  if (!(await resolveFiscalPolicy(user.accountId)).enabled) redirect("/returns")
  const [accounts, params] = await Promise.all([listTreasuryAccounts(), searchParams])
  if (!params.originalDocumentId) redirect("/returns")
  return <FiscalCreditForm originalDocumentId={params.originalDocumentId} actor={{ id: user.id, accountId: user.accountId }} treasuryAccounts={accounts} />
}
