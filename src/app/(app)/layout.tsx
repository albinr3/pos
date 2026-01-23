import { AppShell } from "@/components/app/app-shell"
import { BillingBanner } from "@/components/app/billing-banner"
import { ThemeProvider } from "@/components/app/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { getCurrentUser, getCurrentUserBillingState, hasClerkSession, hasSubUserSession } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

// Marcar como dinámico para evitar prerender (requiere autenticación)
export const dynamic = "force-dynamic"

// Rutas permitidas cuando la cuenta está bloqueada
const BILLING_ALLOWED_PATHS = ["/billing", "/select-user"]

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

  // Obtener estado de billing
  const billingState = await getCurrentUserBillingState()

  // Verificar si la cuenta está bloqueada
  if (billingState && !billingState.canAccessApp) {
    // Obtener la ruta actual
    const headersList = await headers()
    const pathname =
      headersList.get("x-pathname") || headersList.get("x-invoke-path") || ""
    
    // Si no está en una ruta permitida, redirigir a billing
    const isAllowedPath = BILLING_ALLOWED_PATHS.some(
      (path) => pathname === path || pathname.startsWith(path + "/")
    )
    
    if (pathname && !isAllowedPath) {
      redirect("/billing")
    }
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {billingState && <BillingBanner billingState={billingState} />}
      <AppShell>{children}</AppShell>
      <Toaster />
    </ThemeProvider>
  )
}
