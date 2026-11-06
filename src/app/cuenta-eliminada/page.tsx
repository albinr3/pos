import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DeletedAccountCleanup } from "./deleted-account-cleanup"
import { auth } from "@clerk/nextjs/server"
import { isAccountIdentityDeleted } from "@/lib/account-deletion-guard"

export const dynamic = "force-dynamic"

export default async function DeletedAccountPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const processing = (await searchParams).estado === "procesando"
  const { userId } = await auth()
  const allowCleanup = userId ? await isAccountIdentityDeleted(userId) : false
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 p-6">
      <DeletedAccountCleanup allowCleanup={allowCleanup} />
      <h1 className="text-3xl font-semibold">{processing ? "Eliminación en proceso" : "Cuenta eliminada"}</h1>
      <p>{processing ? "Tu solicitud quedó registrada y el acceso a tu negocio está bloqueado. Terminaremos la eliminación automáticamente. No necesitas volver a solicitarla." : "Tu cuenta y los datos activos de tu negocio se eliminaron definitivamente."}</p>
      <Button asChild className="self-start"><Link href="/">Ir al inicio</Link></Button>
    </main>
  )
}
