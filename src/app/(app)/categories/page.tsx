import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { CategoriesClient } from "./categories-client"

export default async function CategoriesPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  if (!hasPermission(user, "canManageCategories", { allowAdminBypass: false })) {
    redirect("/app")
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="text-sm text-muted-foreground">Gestiona las categorías de tus productos.</p>
      </div>
      <CategoriesClient />
    </div>
  )
}

