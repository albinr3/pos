"use client"

import { useEffect, useState, useTransition } from "react"
import { Shield, Check, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"

import { listUsersWithPermissions, updateUserPermissions, setAllPermissions } from "./permissions-actions"

type User = Awaited<ReturnType<typeof listUsersWithPermissions>>[number]

const PERMISSION_LABELS: Record<string, string> = {
  canOverridePrice: "Modificar precios",
  canCancelSales: "Cancelar facturas",
  canCancelReturns: "Cancelar devoluciones",
  canCancelPayments: "Cancelar pagos",
  canEditSales: "Editar facturas",
  canEditProducts: "Editar productos",
  canChangeSaleType: "Cambiar tipo de venta",
  canSellWithoutStock: "Vender sin stock",
  canManageBackups: "Gestionar backups",
  canViewProductCosts: "Ver costos de productos",
  canViewProfitReport: "Ver reporte de ganancia",
}

const PERMISSION_KEYS = [
  "canOverridePrice",
  "canCancelSales",
  "canCancelReturns",
  "canCancelPayments",
  "canEditSales",
  "canEditProducts",
  "canChangeSaleType",
  "canSellWithoutStock",
  "canManageBackups",
  "canViewProductCosts",
  "canViewProfitReport",
] as const

export function PermissionsTab() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, startLoading] = useTransition()
  const [isSaving, startSaving] = useTransition()

  function loadUsers() {
    startLoading(async () => {
      try {
        const data = await listUsersWithPermissions()
        setUsers(data)
      } catch {
        setUsers([])
      }
    })
  }

  useEffect(() => {
    loadUsers()
  }, [])

  function handleToggle(userId: string, permission: keyof typeof PERMISSION_LABELS, value: boolean) {
    // Actualización optimista
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, [permission]: value } : u))
    )

    startSaving(async () => {
      try {
        await updateUserPermissions({ userId, [permission]: value })
        toast({ 
          title: "Cambio aplicado",
          description: `${PERMISSION_LABELS[permission]} ${value ? "activado" : "desactivado"}`,
          duration: 2000
        })
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
        loadUsers() // Revertir
      }
    })
  }

  function handleSetAll(userId: string, value: boolean) {
    // Actualización optimista
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              canOverridePrice: value,
              canCancelSales: value,
              canCancelReturns: value,
              canCancelPayments: value,
              canEditSales: value,
              canEditProducts: value,
              canChangeSaleType: value,
              canSellWithoutStock: value,
              canManageBackups: value,
              canViewProductCosts: value,
              canViewProfitReport: value,
            }
          : u
      )
    )

    startSaving(async () => {
      try {
        await setAllPermissions(userId, value)
        toast({ title: value ? "Todos los permisos activados" : "Todos los permisos desactivados" })
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
        loadUsers() // Revertir
      }
    })
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300">Admin</Badge>
      case "CAJERO":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Cajero</Badge>
      case "ALMACEN":
        return <Badge className="bg-green-100 text-green-800 border-green-300">Almacén</Badge>
      default:
        return <Badge variant="outline">{role}</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Permisos de Usuarios
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="text-sm text-muted-foreground">
          Configura los permisos específicos para cada usuario. Los administradores tienen todos los permisos por defecto.
        </div>
        <Separator />

        {isLoading && <div className="text-sm text-muted-foreground">Cargando usuarios...</div>}

        {!isLoading && users.length === 0 && (
          <div className="text-sm text-muted-foreground">No hay usuarios configurados.</div>
        )}

        <div className="space-y-6">
          {users.map((user) => (
            <div key={user.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-sm text-muted-foreground">@{user.username}</div>
                </div>
                <div className="flex items-center gap-2">
                  {getRoleBadge(user.role)}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAll(user.id, true)}
                    disabled={isSaving}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Todos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetAll(user.id, false)}
                    disabled={isSaving}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Ninguno
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PERMISSION_KEYS.map((permission) => (
                  <div
                    key={permission}
                    className="flex items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <Label className="text-sm">{PERMISSION_LABELS[permission]}</Label>
                    <Switch
                      checked={user[permission]}
                      onCheckedChange={(v) => handleToggle(user.id, permission, v)}
                      disabled={isSaving}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
