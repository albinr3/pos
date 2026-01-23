"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  Building2,
  Users,
  DollarSign,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  ArrowRight,
  CreditCard,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import type { DashboardData } from "./actions"
import { approvePayment, rejectPayment } from "./actions"
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

function formatMoney(cents: number, currency: "DOP" | "USD"): string {
  const amount = cents / 100
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(amount)
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    TRIALING: { label: "Trial", className: "bg-blue-100 text-blue-800 border-blue-300" },
    ACTIVE: { label: "Activo", className: "bg-green-100 text-green-800 border-green-300" },
    GRACE: { label: "Gracia", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    BLOCKED: { label: "Bloqueado", className: "bg-red-100 text-red-800 border-red-300" },
    CANCELED: { label: "Cancelado", className: "bg-gray-100 text-gray-800 border-gray-300" },
  }
  const { label, className } = config[status] || { label: status, className: "" }
  return <Badge className={className}>{label}</Badge>
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const { toast } = useToast()
  const router = useRouter()
  const [loadingPayment, setLoadingPayment] = useState<string | null>(null)
  const [rejectPaymentId, setRejectPaymentId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const { kpis, recentAccounts, pendingPayments, statusDistribution } = data

  const handleApprove = async (paymentId: string) => {
    setLoadingPayment(paymentId)
    try {
      const result = await approvePayment(paymentId)
      if (result.success) {
        toast({ title: "Pago aprobado", description: "El pago ha sido aprobado exitosamente" })
        router.refresh()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Error al aprobar el pago", variant: "destructive" })
    } finally {
      setLoadingPayment(null)
    }
  }

  const handleReject = async () => {
    if (!rejectPaymentId) return
    if (!rejectReason.trim()) {
      toast({
        title: "Motivo requerido",
        description: "Debes indicar el motivo del rechazo.",
        variant: "destructive",
      })
      return
    }
    setLoadingPayment(rejectPaymentId)
    try {
      const result = await rejectPayment(rejectPaymentId, rejectReason.trim())
      if (result.success) {
        toast({ title: "Pago rechazado", description: "El pago ha sido rechazado" })
        router.refresh()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Error al rechazar el pago", variant: "destructive" })
    } finally {
      setLoadingPayment(null)
      setRejectPaymentId(null)
      setRejectReason("")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Vista general del sistema</p>
      </div>

      {/* KPIs principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cuentas Totales</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalAccounts}</div>
            <p className="text-xs text-muted-foreground">
              {kpis.newAccountsThisMonth} nuevas este mes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cuentas Activas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{kpis.activeAccounts}</div>
            <p className="text-xs text-muted-foreground">
              {kpis.trialingAccounts} en trial
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR (DOP)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(kpis.mrrDop, "DOP")}</div>
            <p className="text-xs text-muted-foreground">
              {formatMoney(kpis.mrrUsd, "USD")} en USD
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{kpis.pendingPayments}</div>
            <p className="text-xs text-muted-foreground">
              {formatMoney(kpis.pendingPaymentsAmount, "DOP")} por verificar
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Segunda fila de KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Trial</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{kpis.trialingAccounts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Gracia</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{kpis.graceAccounts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bloqueadas</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{kpis.blockedAccounts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversión Trial</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.trialConversionRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pagos pendientes */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Pagos Pendientes
                </CardTitle>
                <CardDescription>Comprobantes esperando verificación</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/super-admin/payments">
                  Ver todos
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {pendingPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay pagos pendientes de verificación
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Comprobantes</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayments.slice(0, 5).map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{payment.accountName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(payment.createdAt), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatMoney(payment.amountCents, payment.currency)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{payment.proofsCount} archivos</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            asChild
                          >
                            <Link href={`/super-admin/payments?id=${payment.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleApprove(payment.id)}
                            disabled={loadingPayment === payment.id}
                          >
                            {loadingPayment === payment.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setRejectPaymentId(payment.id)
                              setRejectReason("")
                            }}
                            disabled={loadingPayment === payment.id}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Cuentas recientes */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Cuentas Recientes
                </CardTitle>
                <CardDescription>Últimas cuentas registradas</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/super-admin/accounts">
                  Ver todas
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Negocio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAccounts.slice(0, 5).map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <div>
                        <Link
                          href={`/super-admin/accounts/${account.id}`}
                          className="font-medium hover:underline"
                        >
                          {account.name}
                        </Link>
                        {account.ownerEmail && (
                          <div className="text-xs text-muted-foreground">
                            {account.ownerEmail}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={account.status} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{account.currency}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(account.createdAt), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={rejectPaymentId !== null} onOpenChange={(open) => {
        if (!open) {
          setRejectPaymentId(null)
          setRejectReason("")
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar este pago?</AlertDialogTitle>
            <AlertDialogDescription>
              El pago será marcado como rechazado y la cuenta quedará bloqueada si no tiene otros pagos válidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Motivo del rechazo</label>
            <Input
              placeholder="Ej: Comprobante ilegible, monto incorrecto..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={loadingPayment !== null || !rejectReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loadingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Rechazar pago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
