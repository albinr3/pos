"use client"

import { useState } from "react"
import { format } from "date-fns"
import {
  Landmark,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  CreditCard,
  DollarSign,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { useToast } from "@/hooks/use-toast"
import type { BankAccountItem } from "./actions"
import {
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  toggleBankAccountStatus,
} from "./actions"

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(cents / 100)
}

type BankFormData = {
  bankName: string
  accountType: string
  accountNumber: string
  accountName: string
  currency: string
  instructions: string
}

const initialFormData: BankFormData = {
  bankName: "",
  accountType: "Cuenta de Ahorros",
  accountNumber: "",
  accountName: "",
  currency: "DOP",
  instructions: "",
}

export function BanksClient({ initialBanks }: { initialBanks: BankAccountItem[] }) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingBank, setEditingBank] = useState<BankAccountItem | null>(null)
  const [bankToDelete, setBankToDelete] = useState<BankAccountItem | null>(null)
  const [formData, setFormData] = useState<BankFormData>(initialFormData)

  const openCreateDialog = () => {
    setEditingBank(null)
    setFormData(initialFormData)
    setShowFormDialog(true)
  }

  const openEditDialog = (bank: BankAccountItem) => {
    setEditingBank(bank)
    setFormData({
      bankName: bank.bankName,
      accountType: bank.accountType,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      currency: bank.currency,
      instructions: bank.instructions || "",
    })
    setShowFormDialog(true)
  }

  const handleSubmit = async () => {
    if (!formData.bankName || !formData.accountNumber || !formData.accountName) {
      toast({ title: "Error", description: "Completa los campos requeridos", variant: "destructive" })
      return
    }

    setIsLoading(true)
    try {
      if (editingBank) {
        const result = await updateBankAccount(editingBank.id, {
          bankName: formData.bankName,
          accountType: formData.accountType,
          accountNumber: formData.accountNumber,
          accountName: formData.accountName,
          currency: formData.currency,
          instructions: formData.instructions || null,
        })
        if (result.success) {
          toast({ title: "Cuenta actualizada", description: "La cuenta bancaria ha sido actualizada" })
          setShowFormDialog(false)
        } else {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        }
      } else {
        const result = await createBankAccount({
          bankName: formData.bankName,
          accountType: formData.accountType,
          accountNumber: formData.accountNumber,
          accountName: formData.accountName,
          currency: formData.currency,
          instructions: formData.instructions || undefined,
        })
        if (result.success) {
          toast({ title: "Cuenta creada", description: "La cuenta bancaria ha sido creada" })
          setShowFormDialog(false)
        } else {
          toast({ title: "Error", description: result.error, variant: "destructive" })
        }
      }
    } catch {
      toast({ title: "Error", description: "Error al guardar", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleStatus = async (bank: BankAccountItem) => {
    setIsLoading(true)
    try {
      const result = await toggleBankAccountStatus(bank.id)
      if (result.success) {
        toast({
          title: bank.isActive ? "Cuenta desactivada" : "Cuenta activada",
          description: `La cuenta ha sido ${bank.isActive ? "desactivada" : "activada"}`,
        })
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Error al cambiar el estado", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!bankToDelete) return
    setIsLoading(true)
    try {
      const result = await deleteBankAccount(bankToDelete.id)
      if (result.success) {
        toast({ title: "Cuenta eliminada", description: "La cuenta bancaria ha sido eliminada" })
        setShowDeleteDialog(false)
        setBankToDelete(null)
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Error al eliminar", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const totalReceived = initialBanks.reduce((sum, b) => sum + b.totalReceived, 0)
  const activeBanks = initialBanks.filter((b) => b.isActive).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cuentas Bancarias</h1>
          <p className="text-muted-foreground">
            Gestión de cuentas para recibir pagos por transferencia
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva cuenta
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total cuentas</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{initialBanks.length}</div>
            <p className="text-xs text-muted-foreground">{activeBanks} activas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total recibido</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(totalReceived)}</div>
            <p className="text-xs text-muted-foreground">En todas las cuentas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos recibidos</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {initialBanks.reduce((sum, b) => sum + b.paymentsCount, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total histórico</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Cuentas bancarias
          </CardTitle>
          <CardDescription>
            Estas cuentas aparecen como opciones de pago para los clientes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banco</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pagos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialBanks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No hay cuentas bancarias registradas
                    </TableCell>
                  </TableRow>
                ) : (
                  initialBanks.map((bank) => (
                    <TableRow key={bank.id} className={!bank.isActive ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{bank.bankName}</TableCell>
                      <TableCell>{bank.accountType}</TableCell>
                      <TableCell className="font-mono text-sm">{bank.accountNumber}</TableCell>
                      <TableCell>{bank.accountName}</TableCell>
                      <TableCell>
                        {bank.isActive ? (
                          <Badge className="bg-green-100 text-green-800">Activa</Badge>
                        ) : (
                          <Badge variant="secondary">Inactiva</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{bank.paymentsCount} pagos</div>
                          <div className="text-xs text-muted-foreground">
                            {formatMoney(bank.totalReceived)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(bank)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(bank)}>
                              {bank.isActive ? (
                                <>
                                  <EyeOff className="mr-2 h-4 w-4" />
                                  Desactivar
                                </>
                              ) : (
                                <>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Activar
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setBankToDelete(bank)
                                setShowDeleteDialog(true)
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de formulario */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBank ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
            </DialogTitle>
            <DialogDescription>
              {editingBank
                ? "Modifica los datos de la cuenta bancaria"
                : "Agrega una nueva cuenta para recibir pagos"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="bankName">Nombre del banco *</Label>
              <Input
                id="bankName"
                placeholder="Ej: Banco Popular Dominicano"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="accountType">Tipo de cuenta</Label>
                <Select
                  value={formData.accountType}
                  onValueChange={(v) => setFormData({ ...formData, accountType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cuenta de Ahorros">Cuenta de Ahorros</SelectItem>
                    <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Moneda</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => setFormData({ ...formData, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOP">DOP (Pesos)</SelectItem>
                    <SelectItem value="USD">USD (Dólares)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="accountNumber">Número de cuenta *</Label>
              <Input
                id="accountNumber"
                placeholder="Ej: 123-456789-0"
                value={formData.accountNumber}
                onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="accountName">Nombre del titular *</Label>
              <Input
                id="accountName"
                placeholder="Ej: MOVO SRL"
                value={formData.accountName}
                onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="instructions">Instrucciones (opcional)</Label>
              <Textarea
                id="instructions"
                placeholder="Instrucciones adicionales para el pago..."
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFormDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingBank ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para eliminar */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cuenta bancaria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si la cuenta tiene pagos asociados, no podrá ser
              eliminada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBankToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
