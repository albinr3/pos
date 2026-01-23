import { getBillingData } from "./actions"
import { BillingClient } from "./billing-client"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function BillingPage() {
  const data = await getBillingData()

  if (!data) {
    redirect("/login")
  }

  return <BillingClient initialData={data} />
}
