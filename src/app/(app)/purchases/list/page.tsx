import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { PurchasesListClient } from "./purchases-list-client"

export default async function PurchasesListPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  const canManagePurchases = hasPermission(user, "canManagePurchases", { allowAdminBypass: false })
  const canCancelPurchases = hasPermission(user, "canCancelPurchases", { allowAdminBypass: false })
  if (!canManagePurchases && !canCancelPurchases) {
    redirect("/app")
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
        <p className="text-sm text-muted-foreground">Consulta, edita y elimina compras registradas.</p>
      </div>
      <PurchasesListClient />
    </div>
  )
}















