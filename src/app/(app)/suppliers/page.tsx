import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { SuppliersClient } from "./suppliers-client"

export default async function SuppliersPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  if (!hasPermission(user, "canManageSuppliers", { allowAdminBypass: false })) {
    redirect("/app")
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
        <p className="text-sm text-muted-foreground">Gestiona tus proveedores y sus datos de contacto.</p>
      </div>
      <SuppliersClient />
    </div>
  )
}















