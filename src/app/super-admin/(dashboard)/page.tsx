import { getDashboardData } from "./actions"
import { DashboardClient } from "./dashboard-client"

export const dynamic = "force-dynamic"

export default async function SuperAdminDashboardPage() {
  const data = await getDashboardData()
  return <DashboardClient data={data} />
}
