import { getAccountDetail } from "../actions"
import { AccountDetailClient } from "./account-detail-client"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ productPage?: string; productSearch?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const account = await getAccountDetail(id, Number(query.productPage ?? 1), typeof query.productSearch === "string" ? query.productSearch : "")

  if (!account) {
    notFound()
  }

  return <AccountDetailClient account={account} />
}
