import { getCurrentUser } from "@/lib/auth"
import { requireModuleAccess } from "@/lib/module-access"
import { redirect } from "next/navigation"
import { SettingsClient } from "./settings-client"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  await requireModuleAccess("canAccessSettings")

  const user = await getCurrentUser()
  
  if (!user) {
    redirect("/login")
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted-foreground">Configuraciones del sistema.</p>
      </div>
      {(user.isOwner || user.canManageFiscalSettings || user.canManageFiscalSequences || user.canPrepareFiscalDocuments || user.canViewFiscalDocuments) && (
        <div className="rounded-lg border p-6">
          <h2 className="font-semibold">Configuración fiscal</h2>
          <p className="text-sm text-muted-foreground">Pendiente de conexión</p>
        </div>
      )}
      <SettingsClient
        currentUserId={user.id}
        isOwner={user.isOwner}
        role={user.role}
        canManageUsers={user.canManageUsers}
        canViewAuditLogs={user.canViewAuditLogs}
        canManageSettings={user.canManageSettings}
      />
    </div>
  )
}
