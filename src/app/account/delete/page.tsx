import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { isAccountIdentityDeleted } from "@/lib/account-deletion-guard"
import { DeleteAccountForm } from "./delete-account-form"

export const dynamic = "force-dynamic"

export default async function DeleteAccountPage() {
  const { userId } = await auth()
  if (!userId) redirect("/login")
  if (await isAccountIdentityDeleted(userId)) redirect("/cuenta-eliminada?estado=procesando")
  const owner = await getCurrentUser()
  if (!owner) redirect("/select-user")
  if (!owner.isOwner) redirect("/dashboard")
  // Fuera del layout comercial: el dueño puede darse de baja aunque la suscripción esté bloqueada.
  return <DeleteAccountForm />
}
