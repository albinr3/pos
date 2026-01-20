"use client"

import { useEffect, useState } from "react"
import { SignIn, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Loader2 } from "lucide-react"

export default function LoginPage() {
  const { isLoaded, isSignedIn } = useUser()
  const [showSignIn, setShowSignIn] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)

  // Redirigir a selección de usuario cuando está autenticado con Clerk
  useEffect(() => {
    if (!isLoaded) return
    
    if (isSignedIn && !isRedirecting) {
      setIsRedirecting(true)
      // Redirigir a selección de subusuario
      setTimeout(() => {
        window.location.href = "/select-user"
      }, 100)
    }
  }, [isLoaded, isSignedIn, isRedirecting])

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
