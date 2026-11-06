import { redirect } from "next/navigation"
import { getAccountAndUsers } from "./actions"
import { SelectUserClient } from "./select-user-client"
import { hasCompleteSession, hasSubUserSession } from "@/lib/auth"
import { auth } from "@clerk/nextjs/server"
import { isAccountIdentityDeleted } from "@/lib/account-deletion-guard"

export default async function SelectUserPage() {
  const { userId } = await auth()
  // Las otras sesiones del dueño también deben salir del selector, sin intentar crear otra cuenta.
  if (userId && await isAccountIdentityDeleted(userId)) redirect("/cuenta-eliminada?estado=procesando")
  // Si ya tiene sesión completa, ir al dashboard
  const hasSession = await hasCompleteSession()
  if (hasSession) {
    redirect("/dashboard")
  }

  // Si hay sesión de subusuario pero no es válida (cuenta cambió),
  // pasar flag al cliente para limpiarla (no podemos modificar cookies aquí)
  const shouldClearSession = await hasSubUserSession()

  // Obtener account y usuarios
  const result = await getAccountAndUsers()

  if ("error" in result) {
    if (result.error === "not_authenticated") {
      redirect("/login")
    }
    // Otro error - redirigir a login
    redirect("/login")
  }

  return (
    <SelectUserClient
      account={result.account}
      users={result.users}
      shouldClearSession={shouldClearSession}
      needsInitialSetup={result.needsInitialSetup}
    />
  )
}
