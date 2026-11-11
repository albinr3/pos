import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { OperatingExpensesClient } from "./operating-expenses-client"
import { FiscalExpenses } from "./fiscal-expenses"
import { prisma } from "@/lib/db"

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

  const fiscal = await prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId }, select: { enabled: true, version: true } })

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gastos Operativos</h1>
        <p className="text-sm text-muted-foreground">Registra y consulta los gastos operativos de la empresa.</p>
      </div>
      {/* El perfil guardado puede estar apagado; no montar el panel ni sus consultas fiscales. */}
      {canManageExpenses && fiscal?.enabled === true && <FiscalExpenses actor={{ id: user.id, accountId: user.accountId }} enabled={fiscal.enabled} version={fiscal.version} canPrepare={hasPermission(user, "canPrepareFiscalDocuments")} />}
      <OperatingExpensesClient fiscalEnabled={fiscal?.enabled === true} />
    </div>
  )
}















