import { redirect } from "next/navigation"
import { getAccountAndUsers } from "./actions"
import { SelectUserClient } from "./select-user-client"
import { hasCompleteSession } from "@/lib/auth"

export default async function SelectUserPage() {
  // Si ya tiene sesión completa, ir al dashboard
  const hasSession = await hasCompleteSession()
  if (hasSession) {
    redirect("/dashboard")
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
