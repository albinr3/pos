"use client"

import { useState, useTransition } from "react"
import { UploadButton } from "@uploadthing/react"
import type { OurFileRouter } from "@/app/api/uploadthing/core"
import { User, Lock, Loader2, Building2, ChevronRight, UserPlus, Image as ImageIcon, Upload, X } from "lucide-react"
import { UserButton } from "@clerk/nextjs"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

import {
  loginSubUser,
  createFirstUser,
  sendSubUserTemporaryCode,
  loginSubUserWithCode,
} from "./actions"

type SubUser = {
  id: string
  name: string
  username: string
  role: string
  isOwner: boolean
  email?: string | null
}

type Props = {
  account: {
    id: string
    name: string
  }
  users: SubUser[]
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email

  if (local.length <= 2) {
    return `${local[0]}***@${domain}`
  }

  const middle = local.slice(1, -1).replace(/./g, "*")
  return `${local[0]}${middle}${local.slice(-1)}@${domain}`
}

export function SelectUserClient({ account, users }: Props) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [selectedUser, setSelectedUser] = useState<SubUser | null>(
    users.length === 1 ? users[0] : null
  )
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [temporaryCode, setTemporaryCode] = useState("")
  const [tempCodeError, setTempCodeError] = useState("")
  const [tempCodeMessage, setTempCodeMessage] = useState<string | null>(null)
  const [isTempCodeSent, setIsTempCodeSent] = useState(false)
  const [isSendingTempCode, setIsSendingTempCode] = useState(false)
  const [isVerifyingTempCode, setIsVerifyingTempCode] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  const resetTempCodeState = () => {
    setTemporaryCode("")
    setTempCodeError("")
    setTempCodeMessage(null)
    setIsTempCodeSent(false)
    setIsSendingTempCode(false)
    setIsVerifyingTempCode(false)
    setShowForgotPassword(false)
  }
  
  // Estado para onboarding (primer usuario)
  const isOnboarding = users.length === 0
  const [onboardingStep, setOnboardingStep] = useState(isOnboarding ? 1 : 0)
  const [businessName, setBusinessName] = useState(account.name || "")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [newUsername, setNewUsername] = useState("ADMIN")
  const [newUserPassword, setNewUserPassword] = useState("")

  const handleSelectUser = (user: SubUser) => {
    setSelectedUser(user)
    setPassword("")
    setError("")
    resetTempCodeState()
  }

  const handleNextStep = () => {
    if (!businessName.trim()) {
      setError("El nombre del negocio es requerido")
      return
    }
    setError("")
    setOnboardingStep(2)
  }

  const handleBackStep = () => {
    setError("")
    setOnboardingStep(1)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    setError("")

    const formData = new FormData()
    formData.set("accountId", account.id)
    formData.set("username", selectedUser.username)
    formData.set("password", password)

    startTransition(async () => {
      const result = await loginSubUser(formData)
      if (result?.error) {
        setError(result.error)
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    })
  }

  const handleSendTemporaryCode = () => {
    if (!selectedUser) return

    setTempCodeError("")
    setTempCodeMessage(null)
    setIsSendingTempCode(true)

    const formData = new FormData()
    formData.set("accountId", account.id)
    formData.set("username", selectedUser.username)

    startTransition(async () => {
      const result = await sendSubUserTemporaryCode(formData)
      if (result?.error) {
        setTempCodeError(result.error)
        setIsTempCodeSent(false)
      } else {
        setIsTempCodeSent(true)
        setTempCodeMessage(
          result?.email
            ? `Se envió un código temporal a ${maskEmail(result.email)}`
            : "Se envió un código temporal"
        )
        setTemporaryCode("")
      }
      setIsSendingTempCode(false)
    })
  }

  const handleVerifyTemporaryCode = () => {
    if (!selectedUser) return

    if (!temporaryCode.trim()) {
      setTempCodeError("Ingresa el código temporal")
      return
    }

    if (!/^[0-9]{6}$/.test(temporaryCode.trim())) {
      setTempCodeError("Ingresa un código válido de 6 dígitos")
      return
    }

    setTempCodeError("")
    setIsVerifyingTempCode(true)

    const formData = new FormData()
    formData.set("accountId", account.id)
    formData.set("username", selectedUser.username)
    formData.set("code", temporaryCode.trim())

    startTransition(async () => {
      const result = await loginSubUserWithCode(formData)
      if (result?.error) {
        setTempCodeError(result.error)
        setIsVerifyingTempCode(false)
      }
    })
  }

  const handleCreateFirstUser = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!businessName.trim()) {
      setError("El nombre del negocio es requerido")
      return
    }

    if (!newUsername.trim()) {
      setError("El usuario es requerido")
      return
    }
    
    if (!newUserPassword) {
      setError("La contraseña es requerida")
      return
    }

    // Validar que sea exactamente 4 dígitos
    if (!/^\d{4}$/.test(newUserPassword)) {
      setError("La contraseña debe ser exactamente 4 dígitos")
      return
    }

    setError("")

    const formData = new FormData()
    formData.set("accountId", account.id)
    formData.set("password", newUserPassword)
    formData.set("businessName", businessName.trim())
    formData.set("username", newUsername.trim())
    if (logoUrl) {
      formData.set("logoUrl", logoUrl)
    }

    startTransition(async () => {
      const result = await createFirstUser(formData)
      if (result?.error) {
        setError(result.error)
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    })
  }

  const getRoleBadge = (role: string, isOwner: boolean) => {
    if (isOwner) {
      return <Badge className="bg-purple-100 text-purple-800 border-purple-300">Dueño</Badge>
    }
    switch (role) {
      case "ADMIN":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Admin</Badge>
      case "CAJERO":
        return <Badge className="bg-green-100 text-green-800 border-green-300">Cajero</Badge>
      case "ALMACEN":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">Almacén</Badge>
      default:
        return <Badge variant="outline">{role}</Badge>
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="h-6 w-6 text-purple-600" />
            <span className="text-lg font-semibold text-purple-600">
              {isOnboarding ? "Configuración inicial" : account.name}
            </span>
          </div>
          <CardTitle className="text-2xl">
            {isOnboarding
              ? onboardingStep === 1
                ? "Cuéntanos sobre tu negocio"
                : "Crea tu primer usuario"
              : selectedUser
              ? "Ingresa tu contraseña"
              : "Selecciona tu usuario"}
          </CardTitle>
          <CardDescription>
            {isOnboarding
              ? onboardingStep === 1
                ? "Ingresa el nombre de tu negocio y agrega un logo opcional."
                : "El usuario predeterminado es ADMIN. Puedes cambiarlo y crear una contraseña de 4 dígitos."
              : selectedUser
              ? `Ingresa la contraseña para ${selectedUser.name}`
              : "Elige el usuario con el que deseas trabajar"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isOnboarding ? (
            onboardingStep === 1 ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-dashed p-4">
                  <div className="text-sm font-medium mb-2">Paso 1 de 2</div>
                  <div className="space-y-2">
                    <Label htmlFor="business-name">Nombre del negocio</Label>
                    <Input
                      id="business-name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Ej: La Esquina Market"
                      disabled={isPending}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Logo (opcional)</Label>
                  <div className="flex items-center gap-4">
                    {logoUrl ? (
                      <div className="relative">
                        <div className="h-20 w-20 overflow-hidden rounded-md border bg-white">
                          <img src={logoUrl} alt="Logo del negocio" className="h-full w-full object-contain" />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => setLogoUrl(null)}
                          disabled={isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed">
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="relative w-44">
                      <div className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/30 text-center">
                        <Upload className="h-5 w-5 text-purple-600" aria-hidden="true" />
                        <span className="text-sm font-medium text-purple-600">
                          {logoUrl ? "Cambiar logo" : "Subir logo"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">JPG, PNG. Máximo 4MB</span>
                      </div>
                      <UploadButton<OurFileRouter, "logoUploader">
                        endpoint="logoUploader"
                        onClientUploadComplete={(res) => {
                          if (res?.[0]?.ufsUrl || res?.[0]?.url) {
                            setLogoUrl(res[0].ufsUrl ?? res[0].url)
                          }
                        }}
                        onUploadError={(uploadError: Error) => {
                          setError(uploadError.message)
                        }}
                        className="absolute inset-0 z-10"
                        appearance={{
                          container: "h-full w-full",
                          button: "h-full w-full mt-0 bg-transparent text-transparent hover:bg-transparent after:hidden",
                          allowedContent: "hidden",
                        }}
                        content={{
                          button() {
                            return <span className="sr-only">Subir logo</span>
                          },
                        }}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                    {error}
                  </div>
                )}

                <Button type="button" className="w-full" onClick={handleNextStep} disabled={isPending}>
                  Siguiente
                </Button>
              </div>
            ) : (
              <form onSubmit={handleCreateFirstUser} className="space-y-4">
                <div className="rounded-lg border border-dashed p-4">
                  <div className="text-sm font-medium mb-2">Paso 2 de 2</div>
                  <div className="text-sm text-muted-foreground">
                    Negocio: <span className="font-medium text-foreground">{businessName}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-username">Usuario</Label>
                  <Input
                    id="new-username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.replace(/\s/g, ""))}
                    placeholder="ADMIN"
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">Puedes cambiar el usuario si lo deseas.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">Contraseña (4 dígitos)</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={newUserPassword}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "")
                        if (value.length <= 4) {
                          setNewUserPassword(value)
                        }
                      }}
                      placeholder="0000"
                      className="pl-10 text-center text-2xl tracking-widest"
                      disabled={isPending}
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Ingresa exactamente 4 dígitos numéricos
                  </p>
                </div>

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isPending || newUserPassword.length !== 4}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creando usuario...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Crear usuario e ingresar
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={handleBackStep}
                  disabled={isPending}
                >
                  Volver
                </Button>
              </form>
            )
          ) : !selectedUser ? (
            // Lista de usuarios
            <div className="space-y-2">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className="w-full flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <User className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">@{user.username}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(user.role, user.isOwner)}
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // Formulario de contraseña
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50 mb-4">
                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <User className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{selectedUser.name}</div>
                  <div className="text-sm text-muted-foreground">@{selectedUser.username}</div>
                </div>
                {getRoleBadge(selectedUser.role, selectedUser.isOwner)}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Ingresa tu contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    autoFocus
                    disabled={isPending}
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isPending || !password}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  "Ingresar"
                )}
              </Button>

              <div className="space-y-3 pt-3 border-t">
                {!showForgotPassword ? (
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="w-full text-center text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 underline-offset-4 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-center"
                      onClick={handleSendTemporaryCode}
                      disabled={isSendingTempCode || isPending || !selectedUser.email}
                    >
                      {isSendingTempCode ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando código...
                        </>
                      ) : (
                        "Enviar código temporal por email"
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      {selectedUser.email
                        ? `Se enviará a ${maskEmail(selectedUser.email)}`
                        : "Este usuario no tiene email registrado"}
                    </p>
                    {tempCodeMessage && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 text-center">{tempCodeMessage}</p>
                    )}
                    {tempCodeError && (
                      <p className="text-xs text-destructive text-center">{tempCodeError}</p>
                    )}
                    {isTempCodeSent && selectedUser.email && (
                      <div className="space-y-2">
                        <Label htmlFor="temporary-code">Código temporal</Label>
                        <Input
                          id="temporary-code"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={temporaryCode}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\\D/g, "")
                            setTemporaryCode(digits.slice(0, 6))
                          }}
                          placeholder="000000"
                          className="tracking-[0.3em] text-center"
                          disabled={isVerifyingTempCode}
                        />
                        <Button
                          type="button"
                          className="w-full"
                          disabled={isVerifyingTempCode || temporaryCode.trim().length !== 6}
                          onClick={handleVerifyTemporaryCode}
                        >
                          {isVerifyingTempCode ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Verificando...
                            </>
                          ) : (
                            "Usar código temporal"
                          )}
                        </Button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(false)}
                      className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>

              {users.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    resetTempCodeState()
                    setSelectedUser(null)
                  }}
                  disabled={isPending}
                >
                  Cambiar usuario
                </Button>
              )}
            </form>
          )}

          <div className="mt-6 pt-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cuenta principal:</span>
            <UserButton afterSignOutUrl="/login" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
