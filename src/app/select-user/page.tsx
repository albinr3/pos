import { redirect } from "next/navigation"
import { getAccountAndUsers, clearInvalidSubUserSession } from "./actions"
import { SelectUserClient } from "./select-user-client"
import { hasCompleteSession, hasSubUserSession } from "@/lib/auth"

export default async function SelectUserPage() {
  // Si ya tiene sesión completa, ir al dashboard
  const hasSession = await hasCompleteSession()
  if (hasSession) {
    redirect("/dashboard")
  }

  // Si hay sesión de subusuario pero no es válida (cuenta cambió),
  // limpiarla para evitar inconsistencias
  const hasSubUser = await hasSubUserSession()
  if (hasSubUser) {
    // La sesión existe pero no es válida (hasCompleteSession retornó false)
    // Esto significa que el usuario cambió de cuenta en Clerk
    await clearInvalidSubUserSession()
  }

  // Obtener account y usuarios
  const result = await getAccountAndUsers()

  if ("error" in result) {
    if (result.error === "not_authenticated") {
      redirect("/login")
    }
    // Otro error - redirigir a login
    redirect("/login")
  }

  return <SelectUserClient account={result.account} users={result.users} />
}
