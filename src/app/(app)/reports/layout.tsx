import type { ReactNode } from "react"

import { requireModuleAccess } from "@/lib/module-access"

export default async function ReportsLayout({ children }: { children: ReactNode }) {
  await requireModuleAccess("canAccessReports")

  return children
}
