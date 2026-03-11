import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { CustomersClient } from "./customers-client"

export default async function CustomersPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  if (!hasPermission(user, "canManageCustomers", { allowAdminBypass: false })) {
    redirect("/app")
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">Crea clientes para ventas a crédito y cuentas por cobrar.</p>
      </div>
      <CustomersClient />
    </div>
  )
}
