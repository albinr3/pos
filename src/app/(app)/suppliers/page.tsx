import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { SuppliersClient } from "./suppliers-client"

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  if (!hasPermission(user, "canManageSuppliers", { allowAdminBypass: false })) {
    redirect("/app")
  }

  const { create } = await searchParams

  const fiscalSettings = await prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId }, select: { enabled: true, jurisdiction: true } })

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
        <p className="text-sm text-muted-foreground">Gestiona tus proveedores y sus datos de contacto.</p>
      </div>
      <SuppliersClient fiscalEnabled={fiscalSettings?.enabled === true} initiallyOpen={create === "1"} defaultFiscalCountry={fiscalSettings?.jurisdiction ?? null} />
    </div>
  )
}















