import { redirect } from "next/navigation"

import { getCurrentSuperAdmin } from "@/lib/super-admin-auth"

import { EmailMarketingClient } from "./email-marketing-client"
import { getEmailMarketingAccounts } from "./actions"

export const dynamic = "force-dynamic"

export default async function EmailMarketingPage() {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    redirect("/super-admin/login")
  }

  if (!(admin.role === "OWNER" || admin.role === "ADMIN" || admin.canSendEmails)) {
    redirect("/super-admin")
  }

  const accounts = await getEmailMarketingAccounts()

  return <EmailMarketingClient initialAccounts={accounts} />
}
