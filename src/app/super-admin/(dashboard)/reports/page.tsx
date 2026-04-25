import { redirect } from "next/navigation"

import { getCurrentSuperAdmin } from "@/lib/super-admin-auth"

import { getSuperAdminAccountsReport } from "./actions"
import { SuperAdminReportsClient } from "./reports-client"

export const dynamic = "force-dynamic"

export default async function ReportsPage() {
  const admin = await getCurrentSuperAdmin()
  if (!admin) {
    redirect("/super-admin/login")
  }

  if (!(admin.role === "OWNER" || admin.role === "ADMIN" || admin.canViewFinancials)) {
    redirect("/super-admin")
  }

  const rows = await getSuperAdminAccountsReport()

  return <SuperAdminReportsClient rows={rows} />
}
