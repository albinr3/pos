"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { User, Lock, Loader2, Building2, ChevronRight, UserPlus } from "lucide-react"
import { UserButton } from "@clerk/nextjs"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

import { loginSubUser, createFirstUser } from "./actions"

type SubUser = {
  id: string
  name: string
  username: string
  role: string
  isOwner: boolean
}

type Props = {
  account: {
    id: string
    name: string
  }
  users: SubUser[]
}

export function SelectUserClient({ account, users }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [selectedUser, setSelectedUser] = useState<SubUser | null>(
    users.length === 1 ? users[0] : null
  )
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  
  // Estado para crear primer usuario
  const [showCreateForm, setShowCreateForm] = useState(users.length === 0)
  const [newUserPassword, setNewUserPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const handleSelectUser = (user: SubUser) => {
    setSelectedUser(user)
    setPassword("")
    setError("")
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

  const handleCreateFirstUser = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newUserPassword) {
      setError("La contraseña es requerida")
      return
    }

    // Validar que sea exactamente 4 dígitos
    if (!/^\d{4}$/.test(newUserPassword)) {
      setError("La contraseña debe ser exactamente 4 dígitos")
      return
    }

    if (newUserPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden")
      return
    }

    setError("")

    const formData = new FormData()
    formData.set("accountId", account.id)
    formData.set("password", newUserPassword)

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
            <span className="text-lg font-semibold text-purple-600">{account.name}</span>
          </div>
          <CardTitle className="text-2xl">
            {showCreateForm && users.length === 0
              ? "Crea tu contraseña"
              : selectedUser
              ? "Ingresa tu contraseña"
              : "Selecciona tu usuario"}
          </CardTitle>
          <CardDescription>
            {showCreateForm && users.length === 0
              ? "Crea una contraseña de 4 dígitos para comenzar"
              : selectedUser
              ? `Ingresa la contraseña para ${selectedUser.name}`
              : "Elige el usuario con el que deseas trabajar"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showCreateForm && users.length === 0 ? (
            // Formulario para crear primer usuario (solo contraseña de 4 dígitos)
            <form onSubmit={handleCreateFirstUser} className="space-y-4">
              <div className="text-center mb-4">
                <UserPlus className="h-12 w-12 mx-auto text-purple-600 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Crea una contraseña de 4 dígitos para comenzar a usar el sistema
                </p>
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
                      // Solo permitir números
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

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={confirmPassword}
                    onChange={(e) => {
                      // Solo permitir números
                      const value = e.target.value.replace(/\D/g, "")
                      if (value.length <= 4) {
                        setConfirmPassword(value)
                      }
                    }}
                    placeholder="0000"
                    className="pl-10 text-center text-2xl tracking-widest"
                    disabled={isPending}
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isPending || newUserPassword.length !== 4 || confirmPassword.length !== 4}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando usuario...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Crear contraseña e iniciar sesión
                  </>
                )}
              </Button>
            </form>
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

              {users.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setSelectedUser(null)}
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
