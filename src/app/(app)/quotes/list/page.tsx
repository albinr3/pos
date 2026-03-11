import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { QuotesListClient } from "./quotes-list-client"

export default async function QuotesListPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  if (!hasPermission(user, "canManageQuotes", { allowAdminBypass: false })) {
    redirect("/app")
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lista de Cotizaciones</h1>
        <p className="text-sm text-muted-foreground">Consulta y gestiona todas las cotizaciones creadas.</p>
      </div>
      <QuotesListClient />
    </div>
  )
}










