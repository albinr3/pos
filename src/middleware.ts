import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

// Rutas públicas (no requieren autenticación de Clerk)
const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/api/auth/whatsapp(.*)",
  "/api/auth/clerk-webhook",
  "/about",
  "/contact",
  "/pricing",
  "/privacy",
  "/terms",
  "/invoices(.*)",
  "/quotes(.*)",
  "/receipts(.*)",
])

export default clerkMiddleware(async (auth, req) => {
  // Permitir rutas públicas sin verificación de Clerk
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // Para rutas protegidas, Clerk verificará automáticamente
  // Pero también permitimos sesiones propias (verificado en el layout)
  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
}
