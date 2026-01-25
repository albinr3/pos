"use client"

import { useEffect, useState, Suspense } from "react"
import { SignIn, SignUp, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail, Loader2, MessageCircle } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"

function LoginContent() {
  const { isLoaded, isSignedIn, user } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showSignIn, setShowSignIn] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [showWhatsAppLogin, setShowWhatsAppLogin] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [isRequestingOtp, setIsRequestingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [isSignupMode, setIsSignupMode] = useState(false)

  // Detectar si hay ?signup=true en la URL usando window.location directamente
  // para evitar el retraso de searchParams cuando Clerk navega internamente
  useEffect(() => {
    if (typeof window === "undefined") return
    
    const checkSignupParam = () => {
      const params = new URLSearchParams(window.location.search)
      const signupParam = params.get("signup")
      
      // Actualizar isSignupMode basado en el parámetro
      setIsSignupMode(signupParam === "true")
      
      if (signupParam === "true" && !showSignIn) {
        setShowSignIn(true)
      }
    }
    
    // Verificar inmediatamente
    checkSignupParam()
    
    // También verificar con searchParams de Next.js como respaldo
    const signupParamFromSearchParams = searchParams.get("signup")
    if (signupParamFromSearchParams === "true") {
      setIsSignupMode(true)
      if (!showSignIn) {
        setShowSignIn(true)
      }
    }
  }, [searchParams, showSignIn])

  async function handleRequestOtp() {
    if (!phoneNumber.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa tu número de teléfono",
        variant: "destructive",
      })
      return
    }

    setIsRequestingOtp(true)
    try {
      const response = await fetch("/api/auth/whatsapp/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          purpose: "login",
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast({
          title: "Error",
          description: data.error || "Error al enviar código",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Código enviado",
        description: "Revisa WhatsApp para obtener tu código de verificación",
      })
      setShowOtpInput(true)
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al solicitar código. Intenta de nuevo.",
        variant: "destructive",
      })
    } finally {
      setIsRequestingOtp(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      toast({
        title: "Error",
        description: "Por favor ingresa un código válido de 6 dígitos",
        variant: "destructive",
      })
      return
    }

    setIsVerifyingOtp(true)
    try {
      const response = await fetch("/api/auth/whatsapp/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          code: otpCode.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast({
          title: "Error",
          description: data.error || "Código inválido",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "¡Bienvenido!",
        description: "Inicio de sesión exitoso",
      })

      // Redirigir a selección de usuario
      router.push("/select-user")
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al verificar código. Intenta de nuevo.",
        variant: "destructive",
      })
    } finally {
      setIsVerifyingOtp(false)
    }
  }

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

    const handlePopState = () => {
      const signupParam = new URLSearchParams(window.location.search).get("signup")
      if (signupParam === "true" && !showSignIn) {
        setShowSignIn(true)
      }
    }

    window.addEventListener("hashchange", handleHashChange)
    window.addEventListener("popstate", handlePopState)
    // También verificar periódicamente la URL si Clerk cambia la search sin disparar eventos
    const checkUrlInterval = setInterval(() => {
      const currentSearch = window.location.search
      const signupParam = new URLSearchParams(currentSearch).get("signup")
      
      // Actualizar isSignupMode
      setIsSignupMode(signupParam === "true")
      
      if (signupParam === "true" && !showSignIn) {
        setShowSignIn(true)
      }
    }, 500)

    return () => {
      window.removeEventListener("hashchange", handleHashChange)
      window.removeEventListener("popstate", handlePopState)
      clearInterval(checkUrlInterval)
    }
  }, [showSignIn, isSignupMode])

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
      <div 
        className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
        }}
      >
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-white/90 font-medium">
            {isRedirecting ? "Preparando tu cuenta..." : "Cargando..."}
          </p>
        </div>
      </div>
    )
  }

  if (showSignIn) {
    return (
      <div 
        className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
        }}
      >
        {/* Patrón de fondo decorativo */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="relative z-10 w-full max-w-md">
          <div className="mb-4">
            {isSignupMode ? (
              <SignUp
                routing="hash"
                signInUrl="/login"
                forceRedirectUrl="/select-user"
                appearance={{
                  elements: {
                    rootBox: "mx-auto",
                    card: "backdrop-blur-xl bg-white/95 dark:bg-gray-900/95 border-white/20 shadow-2xl",
                  },
                }}
              />
            ) : (
              <SignIn
                routing="hash"
                signUpUrl="/login?signup=true"
                forceRedirectUrl="/select-user"
                appearance={{
                  elements: {
                    rootBox: "mx-auto",
                    card: "backdrop-blur-xl bg-white/95 dark:bg-gray-900/95 border-white/20 shadow-2xl",
                  },
                }}
              />
            )}
          </div>
          <div className="text-center">
            <Button
              variant="ghost"
              onClick={() => {
                setShowSignIn(false)
                // Limpiar el parámetro signup de la URL
                router.push("/login")
              }}
              className="text-sm text-white/90 hover:text-white hover:bg-white/10"
            >
              ← Volver
            </Button>
          </div>
        </div>

        {/* Decoración adicional */}
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
      </div>
    )
  }

  // Pantalla inicial
  return (
    <>
      <div 
        className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
        }}
      >
        {/* Patrón de fondo decorativo */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }} />
        </div>

        {/* Contenedor principal con layout responsive */}
        <div className="relative z-10 w-full max-w-6xl px-4 sm:px-6 mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Ilustración - Visible solo en pantallas grandes */}
            <div className="hidden lg:flex justify-center items-center">
              <div className="relative w-full max-w-lg">
                <Image
                  src="/grafico-login.png"
                  alt="Ilustración decorativa - Sistema POS"
                  width={600}
                  height={600}
                  className="w-full h-auto drop-shadow-2xl"
                  priority
                />
              </div>
            </div>

            {/* Card de login con diseño moderno */}
            <div className="w-full max-w-md mx-auto min-w-0">
              <Card className="backdrop-blur-xl bg-white/95 dark:bg-gray-900/95 border-white/20 shadow-2xl">
                <CardHeader className="text-center space-y-4 pb-6">
                  <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-2"
                    style={{
                      background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
                    }}
                  >
                    <Mail className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent break-words">
                    Bienvenido a MOVOPos
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base break-words">
                    Sistema de ventas e inventario para tu negocio
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={() => setShowSignIn(true)}
                    className="w-full h-auto py-6 flex flex-col items-start gap-3 group hover:shadow-lg transition-all duration-200"
                    variant="outline"
                    size="lg"
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="p-2.5 rounded-lg bg-orange-100 dark:bg-orange-900/20 group-hover:bg-orange-200 dark:group-hover:bg-orange-900/30 transition-colors">
                        <Mail className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div className="flex-1 text-left whitespace-normal leading-relaxed">
                        <div className="font-semibold text-base">Continuar con Email o Google</div>
                        <div className="text-xs text-muted-foreground mt-0.5 break-words leading-relaxed">
                          Usa tu correo electrónico, Google u otro proveedor
                        </div>
                      </div>
                    </div>
                  </Button>

                  {/* Botón de WhatsApp oculto temporalmente
                  <Button
                    onClick={() => setShowWhatsAppLogin(true)}
                    className="w-full h-auto py-4 flex flex-col items-start gap-2"
                    variant="outline"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <MessageCircle className="h-5 w-5" />
                      <span className="font-semibold">Continuar con WhatsApp</span>
                    </div>
                    <span className="text-xs text-muted-foreground text-left">
                      Recibe un código de verificación por WhatsApp
                    </span>
                  </Button>
                  */}

                  <div className="pt-6 border-t">
                    <p className="text-center text-sm text-muted-foreground">
                      ¿Primera vez aquí? Se creará una cuenta automáticamente.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Decoración adicional */}
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-3xl" />
      </div>

      {/* Dialog de login con WhatsApp */}
      <Dialog open={showWhatsAppLogin} onOpenChange={setShowWhatsAppLogin}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar sesión con WhatsApp</DialogTitle>
            <DialogDescription>
              {showOtpInput
                ? "Ingresa el código de 6 dígitos que recibiste por WhatsApp"
                : "Ingresa tu número de teléfono para recibir un código de verificación"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!showOtpInput ? (
              <div className="grid gap-2">
                <Label htmlFor="phone">Número de teléfono</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="8291234567"
                  inputMode="tel"
                  disabled={isRequestingOtp}
                />
                <p className="text-xs text-muted-foreground">
                  Formato: 809, 829 o 849 seguido de 7 dígitos
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="otp">Código de verificación</Label>
                <Input
                  id="otp"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  disabled={isVerifyingOtp}
                  className="text-center text-2xl tracking-widest"
                />
                <p className="text-xs text-muted-foreground">
                  ¿No recibiste el código?{" "}
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={isRequestingOtp}
                    className="text-primary underline hover:no-underline"
                  >
                    Reenviar
                  </button>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWhatsAppLogin(false)
                setShowOtpInput(false)
                setPhoneNumber("")
                setOtpCode("")
              }}
              disabled={isRequestingOtp || isVerifyingOtp}
            >
              Cancelar
            </Button>
            {!showOtpInput ? (
              <Button onClick={handleRequestOtp} disabled={isRequestingOtp}>
                {isRequestingOtp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar código"
                )}
              </Button>
            ) : (
              <Button onClick={handleVerifyOtp} disabled={isVerifyingOtp}>
                {isVerifyingOtp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  "Verificar código"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div 
        className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(35deg, rgb(6, 0, 151) 0%, rgb(130, 4, 255) 73%, rgb(193, 15, 255) 100%)'
        }}
      >
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-white/90 font-medium">Cargando...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
