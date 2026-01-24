import { getBillingData } from "./actions"
import { BillingClient } from "./billing-client"
import { redirect } from "next/navigation"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

export default async function BillingPage() {
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

  return <BillingClient initialData={data} />
}
