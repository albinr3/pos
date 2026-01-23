import { ThemeProvider } from "@/components/app/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { getCurrentSuperAdmin } from "@/lib/super-admin-auth"
import { redirect } from "next/navigation"
import { SuperAdminShell } from "@/app/super-admin/(dashboard)/components/super-admin-shell"

export const dynamic = "force-dynamic"

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await getCurrentSuperAdmin()

  if (!admin) {
    redirect("/super-admin/login")
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <SuperAdminShell admin={admin}>{children}</SuperAdminShell>
      <Toaster />
    </ThemeProvider>
  )
}
