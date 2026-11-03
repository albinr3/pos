import { AppShell } from "@/components/app/app-shell"
import { BillingBanner } from "@/components/app/billing-banner"
import { BillingRedirect } from "@/components/app/billing-redirect"
import { ThemeProvider } from "@/components/app/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { getCurrentUser, getCurrentUserBillingState, hasClerkSession, hasSubUserSession, isInitialSetupComplete } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

// Marcar como dinámico para evitar prerender (requiere autenticación)
export const dynamic = "force-dynamic"

// Rutas permitidas cuando la cuenta está bloqueada
const BILLING_ALLOWED_PATHS = ["/billing", "/select-user"]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 1. Verificar sesión de subusuario (caja/empleado en movopos-session)
  const hasSubUser = await hasSubUserSession()
  if (!hasSubUser) {
    // Si no hay subusuario seleccionado, verificar si hay sesión de Clerk
    const isClerkAuth = await hasClerkSession()
    if (!isClerkAuth) {
      redirect("/login")
    }
    redirect("/select-user")
  }

  // 2. Obtener usuario completo (verifica firma de cookie, usuario activo en BD y cuenta)
  const user = await getCurrentUser()
  if (!user) {
    // Si la sesión del subusuario no es válida, redirigir a select-user o login
    const isClerkAuth = await hasClerkSession()
    if (!isClerkAuth) {
      redirect("/login")
    }
    redirect("/select-user")
  }

  if (!(await isInitialSetupComplete(user.accountId))) {
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
    const accept = headersList.get("accept") || ""
    const fetchDest = headersList.get("sec-fetch-dest") || ""

    // Si no está en una ruta permitida, redirigir a billing
    const isAllowedPath = BILLING_ALLOWED_PATHS.some(
      (path) => pathname === path || pathname.startsWith(path + "/")
    )

    // Solo redirigir en navegaciones de documento (evita loops en fetch/RSC)
    const isDocumentRequest =
      fetchDest === "document" || accept.includes("text/html")

    if (pathname && !isAllowedPath) {
      if (isDocumentRequest) {
        redirect("/billing")
      }
      return (
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <BillingRedirect />
        </ThemeProvider>
      )
    }
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {billingState && <BillingBanner billingState={billingState} />}
      <AppShell billingState={billingState}>{children}</AppShell>
      <Toaster />
    </ThemeProvider>
  )
}
