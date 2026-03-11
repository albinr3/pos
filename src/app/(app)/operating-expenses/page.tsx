import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { OperatingExpensesClient } from "./operating-expenses-client"

export default async function OperatingExpensesPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  const canManageExpenses = hasPermission(user, "canManageExpenses", { allowAdminBypass: false })
  const canCancelExpenses = hasPermission(user, "canCancelExpenses", { allowAdminBypass: false })
  if (!canManageExpenses && !canCancelExpenses) {
    redirect("/app")
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gastos Operativos</h1>
        <p className="text-sm text-muted-foreground">Registra y consulta los gastos operativos de la empresa.</p>
      </div>
      <OperatingExpensesClient />
    </div>
  )
}















