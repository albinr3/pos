"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import {
  CreditCard,
  Search,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  Image as ImageIcon,
  Building2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import type { PaymentListItem } from "./actions"
import { approvePayment, rejectPayment } from "../actions"

function formatMoney(cents: number, currency: "DOP" | "USD"): string {
  const amount = cents / 100
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
  }
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(amount)
}

function PaymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    PENDING: { label: "Pendiente", className: "bg-yellow-100 text-yellow-800", icon: <Clock className="h-3 w-3" /> },
    PAID: { label: "Pagado", className: "bg-green-100 text-green-800", icon: <CheckCircle className="h-3 w-3" /> },
    FAILED: { label: "Fallido", className: "bg-red-100 text-red-800", icon: <XCircle className="h-3 w-3" /> },
    REJECTED: { label: "Rechazado", className: "bg-red-100 text-red-800", icon: <XCircle className="h-3 w-3" /> },
  }
  const { label, className, icon } = config[status] || { label: status, className: "", icon: null }
  return (
    <Badge className={`${className} flex items-center gap-1`}>
      {icon}
      {label}
    </Badge>
  )
}

export function PaymentsClient({ initialPayments }: { initialPayments: PaymentListItem[] }) {
  const { toast } = useToast()
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [loadingPayment, setLoadingPayment] = useState<string | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<PaymentListItem | null>(null)
  const [showProofsDialog, setShowProofsDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [paymentToReject, setPaymentToReject] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const filteredPayments = useMemo(() => {
    return initialPayments.filter((payment) => {
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesAccount = payment.accountName.toLowerCase().includes(searchLower)
        const matchesId = payment.id.toLowerCase().includes(searchLower)
        const matchesRef = payment.reference?.toLowerCase().includes(searchLower)
        if (!matchesAccount && !matchesId && !matchesRef) return false
      }

      if (statusFilter !== "all" && payment.status !== statusFilter) return false

      return true
    })
  }, [initialPayments, search, statusFilter])

  const pendingCount = initialPayments.filter((p) => p.status === "PENDING").length

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
    if (!paymentToReject) return
    if (!rejectReason.trim()) {
      toast({
        title: "Motivo requerido",
        description: "Debes indicar el motivo del rechazo.",
        variant: "destructive",
      })
      return
    }
    setLoadingPayment(paymentToReject)
    try {
      const result = await rejectPayment(paymentToReject, rejectReason.trim())
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
      setShowRejectDialog(false)
      setPaymentToReject(null)
      setRejectReason("")
    }
  }

  const openProofs = (payment: PaymentListItem) => {
    setSelectedPayment(payment)
    setShowProofsDialog(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Pagos</h1>
        <p className="text-muted-foreground">
          Gestión de pagos y verificación de comprobantes
        </p>
      </div>

      {/* Alerta de pendientes */}
      {pendingCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-yellow-600" />
              <span className="font-medium text-yellow-800 dark:text-yellow-200">
                {pendingCount} pago{pendingCount !== 1 ? "s" : ""} pendiente{pendingCount !== 1 ? "s" : ""} de verificación
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusFilter("PENDING")}
              className="border-yellow-300 text-yellow-800 hover:bg-yellow-100"
            >
              Ver pendientes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por cuenta, ID o referencia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="PENDING">Pendiente</SelectItem>
                <SelectItem value="PAID">Pagado</SelectItem>
                <SelectItem value="REJECTED">Rechazado</SelectItem>
                <SelectItem value="FAILED">Fallido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de pagos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {filteredPayments.length} pago{filteredPayments.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Comprobantes</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No se encontraron pagos
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayments.map((payment) => (
                    <TableRow key={payment.id} className={payment.status === "PENDING" ? "bg-yellow-50/50 dark:bg-yellow-950/10" : ""}>
                      <TableCell>
                        <Link
                          href={`/super-admin/accounts/${payment.accountId}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{payment.accountName}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatMoney(payment.amountCents, payment.currency)}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={payment.status} />
                      </TableCell>
                      <TableCell>
                        {payment.bankName ? (
                          <span className="text-sm">{payment.bankName}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {payment.proofs.length > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openProofs(payment)}
                            className="flex items-center gap-1"
                          >
                            <ImageIcon className="h-4 w-4" />
                            {payment.proofs.length} archivo{payment.proofs.length !== 1 ? "s" : ""}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">Sin comprobantes</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {format(new Date(payment.createdAt), "dd/MM/yyyy HH:mm")}
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(payment.createdAt), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {payment.status === "PENDING" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleApprove(payment.id)}
                              disabled={loadingPayment === payment.id}
                              title="Aprobar"
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
                                setPaymentToReject(payment.id)
                                setRejectReason("")
                                setShowRejectDialog(true)
                              }}
                              disabled={loadingPayment === payment.id}
                              title="Rechazar"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog para ver comprobantes */}
      <Dialog open={showProofsDialog} onOpenChange={setShowProofsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comprobantes de pago</DialogTitle>
            <DialogDescription>
              {selectedPayment && (
                <>
                  {selectedPayment.accountName} - {formatMoney(selectedPayment.amountCents, selectedPayment.currency)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {selectedPayment?.proofs.map((proof, index) => (
              <div key={proof.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Comprobante {index + 1}</span>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(proof.uploadedAt), "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
                <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                  <img
                    src={proof.url}
                    alt={`Comprobante ${index + 1}`}
                    className="object-contain w-full h-full"
                  />
                </div>
                <div className="flex items-center justify-between">
                  {proof.amountCents && (
                    <span className="text-sm">
                      Monto declarado: {formatMoney(proof.amountCents, selectedPayment.currency)}
                    </span>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <a href={proof.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Abrir original
                    </a>
                  </Button>
                </div>
                {proof.note && (
                  <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                    {proof.note}
                  </p>
                )}
              </div>
            ))}
          </div>
          {selectedPayment?.status === "PENDING" && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setPaymentToReject(selectedPayment.id)
                  setRejectReason("")
                  setShowProofsDialog(false)
                  setShowRejectDialog(true)
                }}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Rechazar
              </Button>
              <Button
                onClick={() => {
                  handleApprove(selectedPayment.id)
                  setShowProofsDialog(false)
                }}
                disabled={loadingPayment === selectedPayment.id}
              >
                {loadingPayment === selectedPayment.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Aprobar pago
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog para confirmar rechazo */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
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
            <AlertDialogCancel onClick={() => setPaymentToReject(null)}>
              Cancelar
            </AlertDialogCancel>
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
