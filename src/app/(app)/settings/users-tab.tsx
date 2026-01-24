"use client"

import { useEffect, useState, useTransition } from "react"
import { Users, Plus, Pencil, Trash2, Check, X, Shield, Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { toast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import {
  listAccountUsers,
  createUser,
  updateUser,
  deleteUser,
  setAllUserPermissions,
  type UserWithPermissions,
} from "./users-actions"

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

const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as (keyof typeof PERMISSION_LABELS)[]

type NewUserForm = {
  name: string
  username: string
  password: string
  email: string
  role: "ADMIN" | "CAJERO" | "ALMACEN"
  permissions: {
    canOverridePrice: boolean
    canCancelSales: boolean
    canCancelReturns: boolean
    canCancelPayments: boolean
    canEditSales: boolean
    canEditProducts: boolean
    canChangeSaleType: boolean
    canSellWithoutStock: boolean
    canManageBackups: boolean
    canViewProductCosts: boolean
    canViewProfitReport: boolean
  }
}

const DEFAULT_NEW_USER: NewUserForm = {
  name: "",
  username: "",
  password: "",
  email: "",
  role: "CAJERO",
  permissions: {
    canOverridePrice: false,
    canCancelSales: false,
    canCancelReturns: false,
    canCancelPayments: false,
    canEditSales: false,
    canEditProducts: false,
    canChangeSaleType: false,
    canSellWithoutStock: false,
    canManageBackups: false,
    canViewProductCosts: false,
    canViewProfitReport: false,
  },
}

export function UsersTab({ isOwner }: { isOwner: boolean }) {
  const [users, setUsers] = useState<UserWithPermissions[]>([])
  const [isLoading, startLoading] = useTransition()
  const [isSaving, startSaving] = useTransition()

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserWithPermissions | null>(null)

  // Form states
  const [newUser, setNewUser] = useState<NewUserForm>(DEFAULT_NEW_USER)
  const [editPassword, setEditPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  function loadUsers() {
    startLoading(async () => {
      try {
        const data = await listAccountUsers()
        setUsers(data)
      } catch {
        setUsers([])
      }
    })
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.username || !newUser.password) {
      toast({ title: "Error", description: "Nombre, usuario y contraseña son requeridos", variant: "destructive" })
      return
    }

    startSaving(async () => {
      try {
        await createUser({
          name: newUser.name,
          username: newUser.username,
          password: newUser.password,
          email: newUser.email || undefined,
          role: newUser.role,
          permissions: newUser.permissions as NewUserForm["permissions"],
        })
        toast({ title: "Usuario creado" })
        setShowCreateDialog(false)
        setNewUser(DEFAULT_NEW_USER)
        loadUsers()
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "Error al crear usuario", variant: "destructive" })
      }
    })
  }

  const handleUpdateUser = async () => {
    if (!selectedUser) return

    startSaving(async () => {
      try {
        await updateUser(selectedUser.id, {
          name: selectedUser.name,
          username: selectedUser.username,
          email: selectedUser.email || undefined,
          role: selectedUser.role,
          isActive: selectedUser.isActive,
          password: editPassword || undefined,
          permissions: {
            canOverridePrice: selectedUser.canOverridePrice,
            canCancelSales: selectedUser.canCancelSales,
            canCancelReturns: selectedUser.canCancelReturns,
            canCancelPayments: selectedUser.canCancelPayments,
            canEditSales: selectedUser.canEditSales,
            canEditProducts: selectedUser.canEditProducts,
            canChangeSaleType: selectedUser.canChangeSaleType,
            canSellWithoutStock: selectedUser.canSellWithoutStock,
            canManageBackups: selectedUser.canManageBackups,
            canViewProductCosts: selectedUser.canViewProductCosts,
            canViewProfitReport: selectedUser.canViewProfitReport,
          },
        })
        toast({ title: "Usuario actualizado" })
        setShowEditDialog(false)
        setSelectedUser(null)
        setEditPassword("")
        loadUsers()
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "Error al actualizar usuario", variant: "destructive" })
      }
    })
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return

    startSaving(async () => {
      try {
        await deleteUser(selectedUser.id)
        toast({ title: "Usuario eliminado" })
        setShowDeleteDialog(false)
        setSelectedUser(null)
        loadUsers()
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "Error al eliminar usuario", variant: "destructive" })
      }
    })
  }

  const handleTogglePermission = (userId: string, permission: string, value: boolean) => {
    // Actualización optimista
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, [permission]: value } : u))
    )

    startSaving(async () => {
      try {
        await updateUser(userId, {
          permissions: { [permission]: value },
        })
        toast({ 
          title: "Cambio aplicado",
          description: `${PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS]} ${value ? "activado" : "desactivado"}`,
          duration: 2000
        })
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "Error al guardar", variant: "destructive" })
        loadUsers()
      }
    })
  }

  const handleSetAllPermissions = (userId: string, value: boolean) => {
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
        await setAllUserPermissions(userId, value)
        toast({ title: value ? "Todos los permisos activados" : "Todos los permisos desactivados" })
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "Error al guardar", variant: "destructive" })
        loadUsers()
      }
    })
  }

  const getRoleBadge = (role: string, userIsOwner: boolean) => {
    if (userIsOwner) {
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
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Usuarios
            </CardTitle>
            {isOwner && (
              <Button onClick={() => setShowCreateDialog(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Nuevo Usuario
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="text-sm text-muted-foreground">
            {isOwner
              ? "Gestiona los usuarios de tu cuenta. Puedes crear nuevos usuarios y asignar permisos específicos."
              : "Lista de usuarios de la cuenta. Solo el dueño puede gestionar usuarios."}
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
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {user.name}
                        {!user.isActive && (
                          <Badge variant="outline" className="text-red-600 border-red-300">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">@{user.username}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(user.role, user.isOwner)}
                    {isOwner && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user)
                            setShowEditDialog(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!user.isOwner && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user)
                              setShowDeleteDialog(true)
                            }}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Permisos */}
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value={`permissions-${user.id}`}>
                    <div className="flex items-center justify-between">
                      <AccordionTrigger className="flex items-center gap-2 hover:no-underline flex-1">
                        <Shield className="h-4 w-4" />
                        <span className="text-sm font-medium">Permisos</span>
                      </AccordionTrigger>
                      {isOwner && (
                        <div className="flex gap-1 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetAllPermissions(user.id, true)}
                            disabled={isSaving}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Todos
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetAllPermissions(user.id, false)}
                            disabled={isSaving}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Ninguno
                          </Button>
                        </div>
                      )}
                    </div>
                    <AccordionContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                        {PERMISSION_KEYS.map((permission) => (
                          <div
                            key={permission}
                            className="flex items-center justify-between gap-2 rounded-md border p-3"
                          >
                            <Label className="text-sm">{PERMISSION_LABELS[permission]}</Label>
                            <Switch
                              checked={user[permission as keyof UserWithPermissions] as boolean}
                              onCheckedChange={(v) => handleTogglePermission(user.id, permission, v)}
                              disabled={isSaving || !isOwner}
                            />
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Usuario</DialogTitle>
            <DialogDescription>
              Crea un nuevo usuario para tu cuenta. El usuario podrá iniciar sesión con su nombre de usuario y contraseña.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre completo</Label>
              <Input
                id="name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="username">Nombre de usuario</Label>
              <Input
                id="username"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                placeholder="juanperez"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Mínimo 4 caracteres"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="juan@ejemplo.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Rol</Label>
              <Select
                value={newUser.role}
                onValueChange={(v) => setNewUser({ ...newUser, role: v as NewUserForm["role"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="CAJERO">Cajero</SelectItem>
                  <SelectItem value="ALMACEN">Almacén</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={isSaving}>
              {isSaving ? "Creando..." : "Crear Usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              Modifica los datos del usuario. Deja la contraseña en blanco para no cambiarla.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Nombre completo</Label>
                <Input
                  id="edit-name"
                  value={selectedUser.name}
                  onChange={(e) => setSelectedUser({ ...selectedUser, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-username">Nombre de usuario</Label>
                <Input
                  id="edit-username"
                  value={selectedUser.username}
                  onChange={(e) => setSelectedUser({ ...selectedUser, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-password">Nueva contraseña (opcional)</Label>
                <div className="relative">
                  <Input
                    id="edit-password"
                    type={showPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Dejar en blanco para no cambiar"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email (opcional)</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={selectedUser.email || ""}
                  onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-role">Rol</Label>
                <Select
                  value={selectedUser.role}
                  onValueChange={(v) => setSelectedUser({ ...selectedUser, role: v as UserWithPermissions["role"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                    <SelectItem value="CAJERO">Cajero</SelectItem>
                    <SelectItem value="ALMACEN">Almacén</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-active">Usuario activo</Label>
                <Switch
                  id="edit-active"
                  checked={selectedUser.isActive}
                  onCheckedChange={(v) => setSelectedUser({ ...selectedUser, isActive: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateUser} disabled={isSaving}>
              {isSaving ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El usuario "{selectedUser?.name}" será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
