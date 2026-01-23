import { getAccountDetail } from "../actions"
import { AccountDetailClient } from "./account-detail-client"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const account = await getAccountDetail(id)

  if (!account) {
    notFound()
  }

  return <AccountDetailClient account={account} />
}
