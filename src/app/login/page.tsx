"use client"

import { useEffect, useState } from "react"
import { SignIn, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Loader2 } from "lucide-react"

export default function LoginPage() {
  const { isLoaded, isSignedIn, user } = useUser()
  const [showSignIn, setShowSignIn] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)

  // Detectar si hay un callback de SSO en la URL y mostrar SignIn
  useEffect(() => {
    if (typeof window === "undefined") return
    
    const hash = window.location.hash
    // Si hay un callback de SSO, mostrar el componente SignIn automáticamente
    if (hash.includes("sso-callback") || hash.includes("sign-in")) {
      setShowSignIn(true)
    }
  }, [])

  // Escuchar cambios en el hash para detectar cuando Clerk procesa el callback
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleHashChange = () => {
      const hash = window.location.hash
      if (hash.includes("sso-callback") || hash.includes("sign-in")) {
        setShowSignIn(true)
      }
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  // Verificar periódicamente el estado de autenticación cuando hay un callback
  useEffect(() => {
    if (!isLoaded) return
    if (typeof window === "undefined") return

    const hash = window.location.hash
    const hasCallback = hash.includes("sso-callback") || hash.includes("sign-in")
    
    // Si hay un callback, verificar el estado de autenticación periódicamente
    if (hasCallback) {
      const checkAuth = () => {
        const isAuthenticated = isSignedIn || !!user
        if (isAuthenticated && !isRedirecting) {
          setIsRedirecting(true)
          window.location.href = "/select-user"
        }
      }

      // Verificar inmediatamente
      checkAuth()

      // Verificar cada 500ms hasta que se autentique o pasen 10 segundos
      const interval = setInterval(checkAuth, 500)
      const timeout = setTimeout(() => clearInterval(interval), 10000)

      return () => {
        clearInterval(interval)
        clearTimeout(timeout)
      }
    }
  }, [isLoaded, isSignedIn, user, isRedirecting])

  // Redirigir a selección de usuario cuando está autenticado con Clerk (sin callback)
  useEffect(() => {
    if (!isLoaded) return
    if (typeof window === "undefined") return

    const hash = window.location.hash
    const hasCallback = hash.includes("sso-callback") || hash.includes("sign-in")
    
    // Solo redirigir si no hay callback (el callback se maneja en el otro useEffect)
    if (hasCallback) return
    
    // Verificar autenticación - usar isSignedIn y también verificar user como respaldo
    const isAuthenticated = isSignedIn || !!user
    
    if (isAuthenticated && !isRedirecting) {
      setIsRedirecting(true)
      window.location.href = "/select-user"
    }
  }, [isLoaded, isSignedIn, user, isRedirecting])

  // Mostrar pantalla de carga mientras Clerk se inicializa o mientras redirigimos
  if (!isLoaded || isRedirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <p className="text-muted-foreground">
            {isRedirecting ? "Preparando tu cuenta..." : "Cargando..."}
          </p>
        </div>
      </div>
    )
  }

  if (showSignIn) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <div className="w-full max-w-md">
          <SignIn
            routing="hash"
            signUpUrl="/login?signup=true"
            forceRedirectUrl="/select-user"
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "shadow-lg",
              },
            }}
          />
          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              onClick={() => setShowSignIn(false)}
              className="text-sm"
            >
              ← Volver
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Pantalla inicial
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Bienvenido a MOVOPos</CardTitle>
          <CardDescription>
            Inicia sesión para acceder a tu cuenta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => setShowSignIn(true)}
            className="w-full h-auto py-4 flex flex-col items-start gap-2"
            variant="outline"
          >
            <div className="flex items-center gap-2 w-full">
              <Mail className="h-5 w-5" />
              <span className="font-semibold">Continuar con Email o Google</span>
            </div>
            <span className="text-xs text-muted-foreground text-left">
              Usa tu correo electrónico, Google u otro proveedor
            </span>
          </Button>

          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            <p>¿Primera vez aquí? Se creará una cuenta automáticamente.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
