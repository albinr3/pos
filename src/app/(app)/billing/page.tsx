import { getBillingData } from "./actions"
import { BillingClient } from "./billing-client"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { requireModuleAccess } from "@/lib/module-access"
import { getCurrentUser } from "@/lib/auth"
import { DeleteAccountCard } from "@/components/app/delete-account-card"

export const dynamic = "force-dynamic"

export default async function BillingPage() {
  await requireModuleAccess("canAccessBilling")

  if (process.env.NODE_ENV === "development") {
    const h = await headers()
    console.log("[Billing:Page]", {
      pathname: h.get("x-pathname"),
      rsc: h.get("rsc"),
      prefetch: h.get("next-router-prefetch"),
      referer: h.get("referer"),
      accept: h.get("accept"),
      userAgent: h.get("user-agent"),
      dest: h.get("sec-fetch-dest"),
      mode: h.get("sec-fetch-mode"),
      site: h.get("sec-fetch-site"),
    })
  }
  const data = await getBillingData()

  if (!data) {
    redirect("/login")
  }

  const user = await getCurrentUser()
  return <div className="space-y-6"><BillingClient initialData={data} />{user?.isOwner && <DeleteAccountCard />}</div>
}
