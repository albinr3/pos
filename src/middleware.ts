import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

// Rutas públicas (no requieren autenticación de Clerk)
const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/api/auth/whatsapp(.*)",
  "/api/auth/clerk-webhook",
  "/api/webhooks(.*)", // Webhooks de Lemon Squeezy
  "/api/cron(.*)", // Cron jobs
  "/about",
  "/contact",
  "/pricing",
  "/privacy",
  "/terms",
  "/invoices(.*)",
  "/quotes(.*)",
  "/receipts(.*)",
])

// Rutas permitidas cuando la cuenta está bloqueada por billing
// (se verifica en el layout de la app)
export const billingAllowedRoutes = [
  "/billing",
  "/api/uploadthing",
  "/select-user",
]

export default clerkMiddleware(async (auth, req) => {
  // Permitir rutas públicas sin verificación de Clerk
  if (isPublicRoute(req)) {
    const headers = new Headers(req.headers)
    // Pasar la ruta actual al layout (evita redirect loops en server components)
    headers.set("x-pathname", req.nextUrl.pathname)
    return NextResponse.next({ request: { headers } })
  }

  // Para rutas protegidas, Clerk verificará automáticamente
  // Pero también permitimos sesiones propias (verificado en el layout)
  const headers = new Headers(req.headers)
  // Pasar la ruta actual al layout (evita redirect loops en server components)
  headers.set("x-pathname", req.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
})

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
}
