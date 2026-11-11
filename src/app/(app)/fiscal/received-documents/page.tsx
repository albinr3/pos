import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { resolveFiscalPolicy } from "@/lib/fiscal/core/policy"
import { ReceivedDocuments } from "./received-documents"
export const dynamic="force-dynamic"
export default async function Page({searchParams}:{searchParams:Promise<{sourceKind?:string;sourceId?:string}>}) {
  const user=await getCurrentUser()
  if (!user) redirect("/login")
  if (!hasPermission(user,"canViewFiscalDocuments")) redirect("/dashboard")
  const policy=await resolveFiscalPolicy(user.accountId), params=await searchParams
  return <ReceivedDocuments accountId={user.accountId} userId={user.id} canWrite={policy.enabled && hasPermission(user,"canPrepareFiscalDocuments")} initialKind={params.sourceKind??""} initialId={params.sourceId??""}/>
}
