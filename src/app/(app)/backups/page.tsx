import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { BackupsClient } from "./backups-client"

export default async function BackupsPage() {
  const user = await getCurrentUser()
  
  if (!user || (!user.canManageBackups && user.role !== "ADMIN")) {
    redirect("/dashboard")
  }

  return <BackupsClient />
}
