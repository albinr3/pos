import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { BackupsClient } from "./backups-client"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function BackupsPage() {
  const user = await getCurrentUser()
  
  if (!user || !hasPermission(user, "canManageBackups", { allowAdminBypass: false })) {
    redirect("/dashboard")
  }

  return <BackupsClient />
}
