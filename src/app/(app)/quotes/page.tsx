import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { getSettings } from "../settings/actions"
import { QuotesClient } from "./quotes-client"

export default async function QuotesPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  if (!hasPermission(user, "canManageQuotes", { allowAdminBypass: false })) {
    redirect("/app")
  }
  const settings = await getSettings()

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Crea y gestiona cotizaciones para tus clientes.</p>
        </div>
        <div className="relative p-[3px] rounded-lg bg-gradient-to-r from-purple-dark via-purple-primary to-purple-light">
          <Button asChild variant="secondary" className="rounded-[5px]">
            <Link href="/quotes/list">
              <FileText className="mr-2 h-4 w-4" />
              Ver todas las cotizaciones
            </Link>
          </Button>
        </div>
      </div>
      <QuotesClient defaultViewMode={settings.defaultViewMode} itbisRateBp={settings.itbisRateBp} />
    </div>
  )
}
