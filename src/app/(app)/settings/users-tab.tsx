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
import {
  ALL_PERMISSION_KEYS,
  CRITICAL_PERMISSION_KEYS,
  PERMISSION_LABELS,
  PERMISSION_MODULES,
  buildPermissionPatch,
  getModulePermissionState,
  isCriticalPermission,
  type PermissionKey,
} from "@/lib/permissions"

type PermissionState = Record<PermissionKey, boolean>

type NewUserForm = {
  name: string
  username: string
  password: string
  email: string
  role: "ADMIN" | "CAJERO" | "ALMACEN"
  permissions: PermissionState
}

const DEFAULT_PERMISSIONS = ALL_PERMISSION_KEYS.reduce<PermissionState>((acc, key) => {
  acc[key] = false
  return acc
}, {} as PermissionState)

const DEFAULT_NEW_USER_PERMISSIONS: PermissionState = {
  ...DEFAULT_PERMISSIONS,
  canAccessSales: true,
}

const NON_CRITICAL_PERMISSION_KEYS = ALL_PERMISSION_KEYS.filter(
  (permission) => !(CRITICAL_PERMISSION_KEYS as readonly string[]).includes(permission)
)

const DEFAULT_NEW_USER: NewUserForm = {
  name: "",
  username: "",
  password: "",
  email: "",
  role: "CAJERO",
  permissions: DEFAULT_NEW_USER_PERMISSIONS,
}

function getPermissionValue(user: UserWithPermissions, permission: PermissionKey): boolean {
  return Boolean(user[permission as keyof UserWithPermissions])
}

export function UsersTab({ isOwner, canManageUsers }: { isOwner: boolean; canManageUsers: boolean }) {
  const [users, setUsers] = useState<UserWithPermissions[]>([])
  const [isLoading, startLoading] = useTransition()
  const [isSaving, startSaving] = useTransition()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserWithPermissions | null>(null)

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

  function canEditTargetUser(targetUser: UserWithPermissions): boolean {
    if (!canManageUsers) return false
    if (targetUser.isOwner && !isOwner) return false
    return true
  }

  function getEditableModulePermissions(modulePermissions: PermissionKey[]) {
    if (isOwner) return modulePermissions
    return modulePermissions.filter((permission) => !isCriticalPermission(permission))
  }

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
          permissions: newUser.permissions,
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
          permissions: ALL_PERMISSION_KEYS.reduce<Record<PermissionKey, boolean>>((acc, key) => {
            acc[key] = getPermissionValue(selectedUser, key)
            return acc
          }, {} as Record<PermissionKey, boolean>),
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

  const handleTogglePermission = (userId: string, permission: PermissionKey, value: boolean) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, [permission]: value } : user))
    )

    startSaving(async () => {
      try {
        await updateUser(userId, {
          permissions: { [permission]: value },
        })
        toast({
          title: "Cambio aplicado",
          description: `${PERMISSION_LABELS[permission]} ${value ? "activado" : "desactivado"}`,
          duration: 2000,
        })
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "Error al guardar", variant: "destructive" })
        loadUsers()
      }
    })
  }

  const handleToggleModule = (targetUser: UserWithPermissions, permissions: PermissionKey[], value: boolean) => {
    if (!permissions.length) return

    const patch = buildPermissionPatch(permissions, value)

    setUsers((prev) =>
      prev.map((user) => (user.id === targetUser.id ? { ...user, ...patch } : user))
    )

    startSaving(async () => {
      try {
        await updateUser(targetUser.id, { permissions: patch })
        toast({
          title: value ? "Permisos del módulo activados" : "Permisos del módulo desactivados",
          duration: 2000,
        })
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "Error al guardar", variant: "destructive" })
        loadUsers()
      }
    })
  }

  const handleSetAllPermissions = (targetUser: UserWithPermissions, value: boolean) => {
    const editablePermissions = isOwner ? ALL_PERMISSION_KEYS : NON_CRITICAL_PERMISSION_KEYS
    const patch = buildPermissionPatch(editablePermissions, value)

    setUsers((prev) =>
      prev.map((user) => (user.id === targetUser.id ? { ...user, ...patch } : user))
    )

    startSaving(async () => {
      try {
        await setAllUserPermissions(targetUser.id, value)
        toast({ title: value ? "Todos los permisos aplicables activados" : "Todos los permisos aplicables desactivados" })
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
            {canManageUsers && (
              <Button onClick={() => setShowCreateDialog(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Nuevo Usuario
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="text-sm text-muted-foreground">
            {canManageUsers
              ? "Gestiona usuarios y permisos por módulos."
              : "No tienes permisos para gestionar usuarios."}
          </div>
          <Separator />

          {isLoading && <div className="text-sm text-muted-foreground">Cargando usuarios...</div>}

          {!isLoading && users.length === 0 && (
            <div className="text-sm text-muted-foreground">No hay usuarios configurados.</div>
          )}

          <div className="space-y-6">
            {users.map((user) => {
              const canEditUser = canEditTargetUser(user)

              return (
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
                      {canManageUsers && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user)
                              setShowEditDialog(true)
                            }}
                            disabled={!canEditUser}
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
                              disabled={!canEditUser}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value={`permissions-${user.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <AccordionTrigger className="flex items-center gap-2 hover:no-underline flex-1">
                          <Shield className="h-4 w-4" />
                          <span className="text-sm font-medium">Permisos por módulo</span>
                        </AccordionTrigger>
                        <div className="flex gap-1 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetAllPermissions(user, true)}
                            disabled={isSaving || !canEditUser}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Todos
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetAllPermissions(user, false)}
                            disabled={isSaving || !canEditUser}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Ninguno
                          </Button>
                        </div>
                      </div>
                      <AccordionContent>
                        <div className="grid gap-4 pt-2">
                          {PERMISSION_MODULES.map((module) => {
                            const editableModulePermissions = getEditableModulePermissions(module.permissions)
                            const moduleState = getModulePermissionState(
                              user,
                              {
                                ...module,
                                permissions: editableModulePermissions.length > 0
                                  ? editableModulePermissions
                                  : module.permissions,
                              },
                              { allowAdminBypass: false }
                            )
                            const moduleToggleDisabled = isSaving || !canEditUser || editableModulePermissions.length === 0

                            return (
                              <div key={module.id} className="rounded-md border p-3">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-medium">{module.label}</div>
                                    {moduleState === "partial" && (
                                      <Badge variant="outline" className="text-xs">Parcial</Badge>
                                    )}
                                  </div>
                                  <Switch
                                    checked={moduleState === "all"}
                                    onCheckedChange={(value) => handleToggleModule(user, editableModulePermissions, value)}
                                    disabled={moduleToggleDisabled}
                                    className="data-[state=checked]:bg-purple-primary"
                                  />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {module.permissions.map((permission) => {
                                    const disableCriticalForDelegated = !isOwner && isCriticalPermission(permission)
                                    const disabled = isSaving || !canEditUser || disableCriticalForDelegated

                                    return (
                                      <div key={permission} className="flex items-center justify-between gap-2 rounded-md border p-3">
                                        <Label className="text-sm">{PERMISSION_LABELS[permission]}</Label>
                                        <Switch
                                          checked={getPermissionValue(user, permission)}
                                          onCheckedChange={(value) => handleTogglePermission(user.id, permission, value)}
                                          disabled={disabled}
                                          className="data-[state=checked]:bg-purple-primary"
                                        />
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

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
                onValueChange={(value) => setNewUser({ ...newUser, role: value as NewUserForm["role"] })}
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
                  onValueChange={(value) => setSelectedUser({ ...selectedUser, role: value as UserWithPermissions["role"] })}
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
                  onCheckedChange={(value) => setSelectedUser({ ...selectedUser, isActive: value })}
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El usuario &quot;{selectedUser?.name}&quot; será eliminado permanentemente.
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
