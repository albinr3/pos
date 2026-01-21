import { ThemeProvider } from "@/components/app/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { getCurrentUser, hasClerkSession, hasSubUserSession } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function ReceiptsLayout({ children }: { children: React.ReactNode }) {
  // Verificar autenticación (sin AppShell)
  const isClerkAuth = await hasClerkSession()
  if (!isClerkAuth) {
    redirect("/login")
  }

  const hasSubUser = await hasSubUserSession()
  if (!hasSubUser) {
    redirect("/select-user")
  }

  const user = await getCurrentUser()
  if (!user) {
    redirect("/select-user")
  }

  // Layout sin AppShell - solo para impresión
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <div className="min-h-screen bg-background">
        {children}
      </div>
      <Toaster />
    </ThemeProvider>
  )
}
