"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Users,
  Package,
  ShoppingCart,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Shield,
  FileText,
  Loader2,
  MoreHorizontal,
  Play,
  Pause,
  Trash2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import type { AccountDetail } from "../actions"
import { deleteAccount, simulateTrialExpiry, runBillingEngine } from "../actions"
import { updateSubscriptionStatus, extendTrial } from "../../actions"

function formatMoney(cents: number, currency: "DOP" | "USD"): string {
  const amount = cents / 100
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
  }
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(amount)
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    TRIALING: { label: "Trial", className: "bg-blue-100 text-blue-800 border-blue-300", icon: <Clock className="h-3 w-3" /> },
    ACTIVE: { label: "Activo", className: "bg-green-100 text-green-800 border-green-300", icon: <CheckCircle className="h-3 w-3" /> },
    GRACE: { label: "Gracia", className: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: <AlertCircle className="h-3 w-3" /> },
    BLOCKED: { label: "Bloqueado", className: "bg-red-100 text-red-800 border-red-300", icon: <XCircle className="h-3 w-3" /> },
    CANCELED: { label: "Cancelado", className: "bg-gray-100 text-gray-800 border-gray-300", icon: <XCircle className="h-3 w-3" /> },
  }
  const { label, className, icon } = config[status] || { label: status, className: "", icon: null }
  return (
    <Badge className={`${className} flex items-center gap-1`}>
      {icon}
      {label}
    </Badge>
  )
}

function PaymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    PENDING: { label: "Pendiente", className: "bg-yellow-100 text-yellow-800" },
    PAID: { label: "Pagado", className: "bg-green-100 text-green-800" },
    FAILED: { label: "Fallido", className: "bg-red-100 text-red-800" },
    REJECTED: { label: "Rechazado", className: "bg-red-100 text-red-800" },
  }
  const { label, className } = config[status] || { label: status, className: "" }
  return <Badge className={className}>{label}</Badge>
}

export function AccountDetailClient({ account }: { account: AccountDetail }) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [newStatus, setNewStatus] = useState(account.status)

  const handleStatusChange = async () => {
    setIsLoading(true)
    try {
      const result = await updateSubscriptionStatus(account.id, newStatus)
      if (result.success) {
        toast({ title: "Estado actualizado", description: `El estado ha sido cambiado a ${newStatus}` })
        router.refresh()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Error al actualizar el estado", variant: "destructive" })
    } finally {
      setIsLoading(false)
      setShowStatusDialog(false)
    }
  }

  const handleExtendTrial = async (days: number) => {
    setIsLoading(true)
    try {
      const result = await extendTrial(account.id, days)
      if (result.success) {
        toast({ title: "Trial extendido", description: `Se han agregado ${days} días al trial` })
        router.refresh()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Error al extender el trial", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const result = await deleteAccount(account.id)
      if (result.success) {
        toast({ title: "Cuenta eliminada", description: "La cuenta ha sido eliminada" })
        router.push("/super-admin/accounts")
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Error al eliminar la cuenta", variant: "destructive" })
    } finally {
      setIsLoading(false)
      setShowDeleteDialog(false)
    }
  }

  const handleSimulateTrialExpiry = async () => {
    setIsLoading(true)
    try {
      const result = await simulateTrialExpiry(account.id)
      if (result.success) {
        toast({
          title: "Trial expirado (simulado)",
          description: "La cuenta fue marcada como trial vencido y procesada.",
        })
        router.refresh()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Error al simular expiración", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRunBillingEngine = async () => {
    setIsLoading(true)
    try {
      const result = await runBillingEngine()
      if (result.success) {
        toast({
          title: "Billing engine ejecutado",
          description: "Se procesaron las suscripciones.",
        })
        router.refresh()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Error al ejecutar el billing engine", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/super-admin/accounts">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Building2 className="h-8 w-8" />
              {account.name}
            </h1>
            <p className="text-muted-foreground">ID: {account.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={account.status} />
          <Button variant="outline" onClick={() => setShowStatusDialog(true)}>
            <Shield className="mr-2 h-4 w-4" />
            Cambiar estado
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setNewStatus("BLOCKED")
              setShowStatusDialog(true)
            }}
          >
            <Pause className="mr-2 h-4 w-4" />
            Bloquear
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowStatusDialog(true)}>
                <Shield className="mr-2 h-4 w-4" />
                Cambiar estado
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExtendTrial(7)}>
                <Play className="mr-2 h-4 w-4" />
                Extender trial (+7 días)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExtendTrial(15)}>
                <Play className="mr-2 h-4 w-4" />
                Extender trial (+15 días)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSimulateTrialExpiry}>
                <Clock className="mr-2 h-4 w-4" />
                Simular fin de trial (TEST)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRunBillingEngine}>
                <Play className="mr-2 h-4 w-4" />
                Ejecutar billing engine (TEST)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar cuenta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Info principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Suscripción */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Suscripción
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Estado</p>
                  <StatusBadge status={account.status} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Precio mensual</p>
                  <p className="font-medium">
                    {formatMoney(
                      account.currency === "USD" ? account.priceUsdCents : account.priceDopCents,
                      account.currency
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Método de pago</p>
                  <Badge variant="outline">
                    {account.provider === "MANUAL" ? "Transferencia" : "Tarjeta"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Moneda</p>
                  <Badge variant="outline">{account.currency}</Badge>
                </div>
                {account.trialEndsAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">Trial termina</p>
                    <p className="font-medium">
                      {format(new Date(account.trialEndsAt), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                )}
                {account.currentPeriodEndsAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">Período actual termina</p>
                    <p className="font-medium">
                      {format(new Date(account.currentPeriodEndsAt), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                )}
                {account.graceEndsAt && (
                  <div>
                    <p className="text-sm text-muted-foreground">Gracia termina</p>
                    <p className="font-medium text-yellow-600">
                      {format(new Date(account.graceEndsAt), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Datos del negocio */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Datos del negocio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Nombre</p>
                  <p className="font-medium">{account.companyName || account.name}</p>
                </div>
                {account.companyPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{account.companyPhone}</span>
                  </div>
                )}
                {account.companyAddress && (
                  <div className="flex items-center gap-2 md:col-span-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{account.companyAddress}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Registrado {format(new Date(account.createdAt), "dd/MM/yyyy")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Perfil de facturación */}
          {(account.billingLegalName || account.billingEmail) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Perfil de facturación
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {account.billingLegalName && (
                    <div>
                      <p className="text-sm text-muted-foreground">Nombre legal</p>
                      <p className="font-medium">{account.billingLegalName}</p>
                    </div>
                  )}
                  {account.billingTaxId && (
                    <div>
                      <p className="text-sm text-muted-foreground">RNC/Cédula</p>
                      <p className="font-medium">{account.billingTaxId}</p>
                    </div>
                  )}
                  {account.billingEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{account.billingEmail}</span>
                    </div>
                  )}
                  {account.billingPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{account.billingPhone}</span>
                    </div>
                  )}
                  {account.billingAddress && (
                    <div className="flex items-center gap-2 md:col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{account.billingAddress}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Historial de pagos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Historial de pagos
              </CardTitle>
              <CardDescription>{account.payments.length} pagos registrados</CardDescription>
            </CardHeader>
            <CardContent>
              {account.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay pagos registrados
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Comprobantes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {account.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          {format(new Date(payment.createdAt), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell>{formatMoney(payment.amountCents, payment.currency)}</TableCell>
                        <TableCell>
                          <PaymentStatusBadge status={payment.status} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.proofsCount} archivos</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Estadísticas */}
          <Card>
            <CardHeader>
              <CardTitle>Uso del sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Usuarios
                </span>
                <span className="font-medium">{account.usersCount}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Productos
                </span>
                <span className="font-medium">{account.productsCount}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  Ventas
                </span>
                <span className="font-medium">{account.salesCount}</span>
              </div>
            </CardContent>
          </Card>

          {/* Usuarios */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Usuarios ({account.users.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {account.users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{user.name}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.isOwner && (
                        <Badge className="bg-purple-100 text-purple-800 text-xs">Dueño</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{user.role}</Badge>
                      {!user.isActive && (
                        <Badge variant="destructive" className="text-xs">Inactivo</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog para cambiar estado */}
      <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar estado de suscripción</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona el nuevo estado para esta cuenta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TRIALING">Trial</SelectItem>
              <SelectItem value="ACTIVE">Activo</SelectItem>
              <SelectItem value="GRACE">Gracia</SelectItem>
              <SelectItem value="BLOCKED">Bloqueado</SelectItem>
              <SelectItem value="CANCELED">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusChange} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para eliminar */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los datos de la cuenta
              incluyendo usuarios, productos, ventas y configuraciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eliminar cuenta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
