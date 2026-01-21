import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { BackupsClient } from "./backups-client"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function BackupsPage() {
  const user = await getCurrentUser()
  
  if (!user || (!user.canManageBackups && user.role !== "ADMIN")) {
    redirect("/dashboard")
  }

  return <BackupsClient />
}
