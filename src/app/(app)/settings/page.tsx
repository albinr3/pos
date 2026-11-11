import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { requireModuleAccess } from "@/lib/module-access"
import { redirect } from "next/navigation"
import { SettingsClient } from "./settings-client"
import { FiscalSettingsActivation } from "./fiscal-settings-activation"
import { FiscalSequences } from "./fiscal-sequences"

// Evitar prerender durante el build
export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  await requireModuleAccess("canAccessSettings")

  const user = await getCurrentUser()
  
  if (!user) {
    redirect("/login")
  }

  const fiscalSettings = await prisma.fiscalSettings.findUnique({ where: { accountId: user.accountId }, select: { enabled: true } })

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted-foreground">Configuraciones del sistema.</p>
      </div>
      <SettingsClient
        fiscalEnabled={fiscalSettings?.enabled === true}
        fiscalSection={(user.isOwner || user.canManageFiscalSettings || user.canManageFiscalSequences || user.canPrepareFiscalDocuments || user.canViewFiscalDocuments) && (
          <div className="rounded-lg border p-6">
            <h2 className="font-semibold">Configuración fiscal</h2>
            {/* La activación de la cuenta y la conexión externa son estados distintos: indicar ambos. */}
            <p className={`mt-2 w-fit rounded-full px-3 py-1 text-sm font-medium ${fiscalSettings?.enabled === true ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-muted text-muted-foreground"}`}>
              {fiscalSettings?.enabled === true ? "Configuración fiscal activa · Ambiente de prueba" : "Configuración fiscal inactiva"}
            </p>
            <p className="text-sm text-muted-foreground">Pendiente de conexión</p>
            {/* Ser dueño no activa el módulo: ocultar también la descarga mientras esté apagado. */}
            {fiscalSettings?.enabled === true && user.isOwner && <p className="mt-3 text-sm"><a className="underline" href="/api/fiscal/history/export" download>Descargar historial fiscal</a></p>}
            {(user.isOwner || user.canManageFiscalSettings) && <FiscalSettingsActivation enabled={fiscalSettings?.enabled === true} />}
            {/* La configuración guardada no equivale a una activación: no mostrar secuencias mientras el módulo esté apagado. */}
            {fiscalSettings?.enabled === true && (user.isOwner || user.canManageFiscalSequences) && <FiscalSequences />}
          </div>
        )}
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
