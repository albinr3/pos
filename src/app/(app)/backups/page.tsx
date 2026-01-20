import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { BackupsClient } from "./backups-client"

export default async function BackupsPage() {
  // TODO: Obtener usuario real de la sesión
  // Por ahora, verificar que el usuario "admin" tenga permiso
  const user = await prisma.user.findUnique({
    where: { username: "admin" },
    select: { canManageBackups: true, role: true },
  })

  if (!user || (!user.canManageBackups && user.role !== "ADMIN")) {
    redirect("/dashboard")
  }

  return <BackupsClient />
}
