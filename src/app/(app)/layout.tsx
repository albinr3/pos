import { AppShell } from "@/components/app/app-shell"
import { ThemeProvider } from "@/components/app/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { getCurrentUser, hasClerkSession, hasSubUserSession } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Verificar sesión de Clerk (cuenta principal)
  const isClerkAuth = await hasClerkSession()
  if (!isClerkAuth) {
    redirect("/login")
  }

  // Verificar sesión de subusuario
  const hasSubUser = await hasSubUserSession()
  if (!hasSubUser) {
    redirect("/select-user")
  }

  // Obtener usuario completo (verifica que ambas sesiones sean válidas)
  const user = await getCurrentUser()
  if (!user) {
    // Si getCurrentUser falla, las sesiones no coinciden
    redirect("/select-user")
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AppShell>{children}</AppShell>
      <Toaster />
    </ThemeProvider>
  )
}
