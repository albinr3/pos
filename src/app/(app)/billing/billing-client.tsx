"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CreditCard,
  Building2,
  Upload,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { UploadButton } from "@uploadthing/react"
import type { OurFileRouter } from "@/app/api/uploadthing/core"
import {
  getBillingData,
  saveBillingProfile,
  createDopPayment,
  submitPaymentProof,
  getUsdCheckoutUrl,
} from "./actions"
import type {
  BillingSubscription,
  BillingProfile,
  BillingPayment,
} from "@prisma/client"
import type { BillingState, BankAccountInfo } from "@/lib/billing"
import { format } from "date-fns"
import { es } from "date-fns/locale"

type BillingData = {
  subscription: BillingSubscription | null
  profile: BillingProfile | null
  state: BillingState
  payments: (BillingPayment & { proofs: { id: string; url: string }[] })[]
  bankAccounts: BankAccountInfo[]
}

interface BillingClientProps {
  initialData: BillingData
}

export function BillingClient({ initialData }: BillingClientProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [data, setData] = useState<BillingData>({
    ...initialData,
    bankAccounts: initialData.bankAccounts ?? [],
    payments: initialData.payments ?? [],
  })
  const [loading, setLoading] = useState(false)
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null)
  const [uploadedProofUrl, setUploadedProofUrl] = useState<string | null>(null)
  const [uploadedProofName, setUploadedProofName] = useState<string | null>(null)
  const [uploadedProofType, setUploadedProofType] = useState<string | null>(null)
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(
    data.bankAccounts?.[0]?.id || ""
  )
  const pendingProofKey = "billing-proof-pending"

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    console.log("[BillingClient] initial data", {
      hasState: !!initialData?.state,
      payments: initialData?.payments?.length ?? 0,
      bankAccounts: initialData?.bankAccounts?.length ?? 0,
      status: initialData?.state?.status,
    })
  }, [initialData])

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    console.log("[BillingClient] mounted")
    return () => {
      console.log("[BillingClient] unmounted")
    }
  }, [])

  useEffect(() => {
    if (!selectedBankAccountId && data.bankAccounts?.length) {
      setSelectedBankAccountId(data.bankAccounts[0].id)
    }
  }, [data.bankAccounts, selectedBankAccountId])

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    legalName: data.profile?.legalName || "",
    taxId: data.profile?.taxId || "",
    address: data.profile?.address || "",
    email: data.profile?.email || "",
    phone: data.profile?.phone || "",
  })

  const safeBankAccounts = data.bankAccounts ?? []

  // Get the selected bank account details
  const selectedBankAccount = safeBankAccounts.find(
    (acc) => acc.id === selectedBankAccountId
  )

  const refreshData = async () => {
    const newData = await getBillingData()
    if (newData) {
      setData({
        ...newData,
        bankAccounts: newData.bankAccounts ?? [],
        payments: newData.payments ?? [],
      })
      if (process.env.NODE_ENV === "development") {
        console.log("[BillingClient] refreshed data", {
          hasState: !!newData?.state,
          payments: newData?.payments?.length ?? 0,
          bankAccounts: newData?.bankAccounts?.length ?? 0,
          status: newData?.state?.status,
        })
      }
    } else if (process.env.NODE_ENV === "development") {
      console.log("[BillingClient] refreshData returned null")
    }
  }

  const getFileNameFromUrl = (url: string) => {
    try {
      const parsed = new URL(url)
      const name = parsed.pathname.split("/").pop()
      return name ? decodeURIComponent(name) : "comprobante.pdf"
    } catch {
      const fallback = url.split("/").pop()
      return fallback ? decodeURIComponent(fallback) : "comprobante.pdf"
    }
  }

  const handleSaveProfile = async () => {
    setLoading(true)
    try {
      const result = await saveBillingProfile(profileForm)
      if (result.success) {
        toast({ title: "Perfil guardado correctamente" })
        await refreshData()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePayDop = async () => {
    if (!selectedBankAccountId) {
      toast({ title: "Error", description: "Selecciona una cuenta bancaria", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const result = await createDopPayment(selectedBankAccountId)
      if (result.success && result.paymentId) {
        setActivePaymentId(result.paymentId)
        setUploadedProofUrl(null)
        setUploadedProofName(null)
        setUploadedProofType(null)
        try {
          localStorage.removeItem(pendingProofKey)
        } catch {}
        await refreshData()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePayUsd = async () => {
    setLoading(true)
    try {
      const result = await getUsdCheckoutUrl()
      if (result.success && result.url) {
        window.open(result.url, "_blank")
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleProofUploaded = async (paymentId: string, url: string) => {
    setLoading(true)
    try {
      const result = await submitPaymentProof(paymentId, url)
      if (result.success) {
        toast({ title: "Comprobante subido correctamente. Tu acceso ha sido activado." })
        setActivePaymentId(null)
        setUploadedProofUrl(null)
        setUploadedProofName(null)
        setUploadedProofType(null)
        try {
          localStorage.removeItem(pendingProofKey)
        } catch {}
        await refreshData()
        router.refresh()
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } finally {
      setLoading(false)
    }
  }

  if (!data?.state) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <h1 className="text-2xl font-bold mb-4">Facturación</h1>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-4">
            No se pudo cargar la información de facturación.
          </p>
          <Button onClick={refreshData} disabled={loading}>
            Reintentar
          </Button>
        </Card>
      </div>
    )
  }

  const { state, subscription } = data
  const bankAccounts = safeBankAccounts
  const payments = data.payments ?? []

  const latestPayment = payments[0]

  const formatMoney = (cents: number, currency: string) => {
    const amount = cents / 100
    if (currency === "USD") {
      return `$${amount.toFixed(2)} USD`
    }
    return `RD$${amount.toLocaleString("es-DO", { maximumFractionDigits: 0 })} DOP`
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      TRIALING: { label: "Período de prueba", variant: "secondary" },
      ACTIVE: { label: "Activo", variant: "default" },
      GRACE: { label: "Período de gracia", variant: "outline" },
      BLOCKED: { label: "Bloqueado", variant: "destructive" },
      CANCELED: { label: "Cancelado", variant: "destructive" },
    }
    const config = variants[status] || { label: status, variant: "secondary" }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getPaymentStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      PENDING: { label: "Pendiente", variant: "outline" },
      PAID: { label: "Pagado", variant: "default" },
      FAILED: { label: "Fallido", variant: "destructive" },
      REJECTED: { label: "Rechazado", variant: "destructive" },
    }
    const config = variants[status] || { label: status, variant: "secondary" }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  // Find pending payment that needs proof
  const pendingPayment = payments.find(
    (p) => p.status === "PENDING" && (p.proofs?.length ?? 0) === 0
  )
  const paymentNeedingProof = activePaymentId 
    ? payments.find(p => p.id === activePaymentId) 
    : pendingPayment

  useEffect(() => {
    if (uploadedProofUrl) return
    try {
      localStorage.removeItem(pendingProofKey)
    } catch {}
  }, [uploadedProofUrl, pendingProofKey])

  useEffect(() => {
    if (!uploadedProofUrl) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [uploadedProofUrl, paymentNeedingProof])

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Facturación</h1>

      {/* Status Card */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-semibold">Estado de tu suscripción</h2>
              {getStatusBadge(state.status)}
            </div>
            
            {state.isTrialing && state.trialDaysRemaining !== null && (
              <p className="text-muted-foreground">
                <Clock className="inline h-4 w-4 mr-1" />
                {state.trialDaysRemaining === 0
                  ? "Tu período de prueba termina hoy"
                  : `Te quedan ${state.trialDaysRemaining} días de prueba`}
              </p>
            )}

            {state.isGrace && state.graceDaysRemaining !== null && (
              <p className="text-orange-600">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                {state.graceDaysRemaining === 0
                  ? "Tu período de gracia termina hoy"
                  : `Te quedan ${state.graceDaysRemaining} días de gracia`}
              </p>
            )}

            {state.isActive && state.daysRemaining !== null && (
              <p className="text-muted-foreground">
                <CheckCircle className="inline h-4 w-4 mr-1" />
                Próxima facturación en {state.daysRemaining} días
              </p>
            )}

            {state.isBlocked && (
              <p className="text-red-600">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                Tu cuenta está bloqueada. Realiza un pago para continuar.
              </p>
            )}

            {latestPayment?.status === "REJECTED" && latestPayment.rejectionReason && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <div className="font-medium">Pago rechazado</div>
                <div>{latestPayment.rejectionReason}</div>
              </div>
            )}

            {latestPayment?.status === "PAID" && latestPayment.provider === "MANUAL" && (
              <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                <div className="font-medium">Pago aprobado</div>
                <div>Tu comprobante fue aprobado y tu suscripción está activa.</div>
              </div>
            )}
          </div>

          <div className="text-right">
            <p className="text-sm text-muted-foreground">Plan actual</p>
            <p className="text-xl font-bold">
              {formatMoney(state.priceInCents, state.currency)}
              <span className="text-sm font-normal text-muted-foreground">/mes</span>
            </p>
          </div>
        </div>
      </Card>

      {/* Payment Options */}
      {(state.needsPayment || state.isBlocked || state.isTrialing) && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Métodos de pago</h2>

          <Tabs defaultValue="dop" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dop">
                <Building2 className="h-4 w-4 mr-2" />
                Transferencia (DOP)
              </TabsTrigger>
              <TabsTrigger value="usd">
                <CreditCard className="h-4 w-4 mr-2" />
                Tarjeta (USD)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dop" className="mt-4">
              <div className="space-y-4">
                {/* Bank Account Selection */}
                {bankAccounts.length === 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg text-center">
                    <AlertCircle className="h-5 w-5 inline mr-2" />
                    No hay cuentas bancarias configuradas. Contacta al administrador.
                  </div>
                ) : (
                  <>
                    <div>
                      <Label className="text-sm font-medium mb-2 block">
                        Selecciona el banco donde harás la transferencia:
                      </Label>
                      <div className="grid gap-3">
                        {bankAccounts.map((account) => (
                          <div
                            key={account.id}
                            onClick={() => setSelectedBankAccountId(account.id)}
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                              selectedBankAccountId === account.id
                                ? "border-primary bg-primary/5"
                                : "border-muted hover:border-muted-foreground/30"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {account.bankLogo ? (
                                <img
                                  src={account.bankLogo}
                                  alt={account.bankName}
                                  className="h-8 w-8 object-contain"
                                />
                              ) : (
                                <Building2 className="h-8 w-8 text-muted-foreground" />
                              )}
                              <div className="flex-1">
                                <p className="font-medium">{account.bankName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {account.accountType}
                                </p>
                              </div>
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                  selectedBankAccountId === account.id
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground/30"
                                }`}
                              >
                                {selectedBankAccountId === account.id && (
                                  <CheckCircle className="h-3 w-3 text-white" />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Selected Bank Account Details */}
                    {selectedBankAccount && (
                      <div className="bg-muted p-4 rounded-lg">
                        <h3 className="font-medium mb-2">Datos para transferencia</h3>
                        <div className="grid gap-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Banco:</span>
                            <span className="font-medium">{selectedBankAccount.bankName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tipo de cuenta:</span>
                            <span className="font-medium">{selectedBankAccount.accountType}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Número:</span>
                            <span className="font-medium font-mono">{selectedBankAccount.accountNumber}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">A nombre de:</span>
                            <span className="font-medium">{selectedBankAccount.accountName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Monto:</span>
                            <span className="font-bold text-lg">
                              {formatMoney(subscription?.priceDopCents || 130000, "DOP")}
                            </span>
                          </div>
                          {selectedBankAccount.instructions && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-muted-foreground text-xs">
                                {selectedBankAccount.instructions}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {paymentNeedingProof ? (
                  <div className="relative border-2 border-dashed border-primary/50 rounded-lg p-6">
                    <UploadButton<OurFileRouter, "paymentProofUploader">
                      endpoint="paymentProofUploader"
                      onClientUploadComplete={(res) => {
                        if (res?.[0]?.url) {
                          const file = res[0] as {
                            url: string
                            name?: string
                            fileName?: string
                            originalName?: string
                            type?: string
                            fileType?: string
                            mime?: string
                            contentType?: string
                          }
                          setUploadedProofUrl(file.url)
                          setUploadedProofName(
                            file.name || file.fileName || file.originalName || getFileNameFromUrl(file.url)
                          )
                          setUploadedProofType(
                            file.type || file.fileType || file.mime || file.contentType || null
                          )
                          try {
                            localStorage.setItem(pendingProofKey, "1")
                          } catch {}
                        }
                      }}
                      onUploadError={(error) => {
                        toast({
                          title: "Error al subir",
                          description: error.message,
                          variant: "destructive",
                        })
                      }}
                      className="absolute inset-0 z-10"
                      appearance={{
                        container: "h-full w-full",
                        button:
                          "h-full w-full mt-0 bg-transparent text-transparent hover:bg-transparent after:hidden cursor-pointer",
                        allowedContent: "hidden",
                      }}
                      content={{
                        button() {
                          return <span className="sr-only">Subir comprobante</span>
                        },
                      }}
                    />
                    <div className="relative z-20 pointer-events-none">
                      {!uploadedProofUrl && (
                        <>
                          <div className="flex justify-center mb-2 text-purple-primary">
                            <Upload className="h-8 w-8" />
                          </div>
                          <h3 className="font-medium mb-2 text-center">Sube tu comprobante</h3>
                          <p className="text-sm text-muted-foreground text-center mb-4">
                            Sube la imagen o PDF y luego presiona Enviar comprobante.
                          </p>
                        </>
                      )}
                      {uploadedProofUrl && (
                        <div className="mx-auto mb-4 w-full max-w-xl rounded-md border bg-background p-3 pointer-events-auto">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center">
                            <div className="relative w-full md:w-72">
                              {(uploadedProofType === "application/pdf" ||
                                uploadedProofName?.toLowerCase().endsWith(".pdf") ||
                                uploadedProofUrl.toLowerCase().includes(".pdf")) ? (
                                <div className="flex h-44 w-full items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                                  <div className="flex flex-col items-center gap-1">
                                    <FileText className="h-6 w-6" />
                                    <span className="font-medium">PDF</span>
                                    <span className="max-w-[14rem] truncate text-xs">
                                      {uploadedProofName || "comprobante.pdf"}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <img
                                  src={uploadedProofUrl}
                                  alt="Comprobante subido"
                                  className="h-44 w-full rounded-md object-contain"
                                />
                              )}
                              <p className="mt-2 text-xs text-muted-foreground text-center">
                                Comprobante cargado
                              </p>
                            </div>
                            <div className="flex w-full md:w-56 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 py-4 text-center">
                              <UploadButton<OurFileRouter, "paymentProofUploader">
                                endpoint="paymentProofUploader"
                                onClientUploadComplete={(res) => {
                                  if (res?.[0]?.url) {
                                    const file = res[0] as {
                                      url: string
                                      name?: string
                                      fileName?: string
                                      originalName?: string
                                    }
                                    setUploadedProofUrl(file.url)
                                    setUploadedProofName(
                                      file.name ||
                                        file.fileName ||
                                        file.originalName ||
                                        getFileNameFromUrl(file.url)
                                    )
                                    try {
                                      localStorage.setItem(pendingProofKey, "1")
                                    } catch {}
                                  }
                                }}
                                onUploadError={(error) => {
                                  toast({
                                    title: "Error al subir",
                                    description: error.message,
                                    variant: "destructive",
                                  })
                                }}
                                appearance={{
                                  container: "w-full",
                                  button:
                                    "w-full h-full py-4 bg-transparent text-muted-foreground hover:text-foreground",
                                  allowedContent: "hidden",
                                }}
                                content={{
                                  button() {
                                    return (
                                      <div className="flex flex-col items-center gap-2">
                                        <Upload className="h-5 w-5 text-purple-primary" />
                                        <span className="text-xs font-semibold text-purple-primary">
                                          Subir otro comprobante
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                          JPG, PNG o PDF
                                        </span>
                                      </div>
                                    )
                                  },
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="mt-4 flex justify-center pointer-events-auto">
                        <Button
                          onClick={() => {
                            if (uploadedProofUrl) {
                              handleProofUploaded(paymentNeedingProof.id, uploadedProofUrl)
                            } else {
                              toast({
                                title: "Falta comprobante",
                                description: "Sube un comprobante antes de enviar.",
                                variant: "destructive",
                              })
                            }
                          }}
                          disabled={loading || !uploadedProofUrl}
                        >
                          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Enviar comprobante
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={handlePayDop}
                    disabled={loading || bankAccounts.length === 0 || !selectedBankAccountId}
                    className="w-full"
                    size="lg"
                  >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Upload className="h-4 w-4 mr-2" />
                    Hice la transferencia, subir comprobante
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="usd" className="mt-4">
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold mb-1">
                    {formatMoney(subscription?.priceUsdCents || 2000, "USD")}
                    <span className="text-sm font-normal text-muted-foreground">/mes</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Pago recurrente con tarjeta de crédito/débito
                  </p>
                </div>

                <Button
                  onClick={handlePayUsd}
                  disabled={loading}
                  className="w-full"
                  size="lg"
                >
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pagar con tarjeta
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Serás redirigido a Lemon Squeezy para completar el pago de forma segura.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      )}

      {/* Billing Profile */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Datos de facturación</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Estos datos se usarán para generar tus recibos.
        </p>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="legalName">Nombre legal o razón social</Label>
            <Input
              id="legalName"
              value={profileForm.legalName}
              onChange={(e) => setProfileForm({ ...profileForm, legalName: e.target.value })}
              placeholder="Ej: Juan Pérez o Mi Empresa SRL"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="taxId">Cédula o RNC</Label>
            <Input
              id="taxId"
              value={profileForm.taxId}
              onChange={(e) => setProfileForm({ ...profileForm, taxId: e.target.value })}
              placeholder="Ej: 001-0000000-0"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              value={profileForm.address}
              onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
              placeholder="Ej: Calle Principal #123, Santo Domingo"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email para recibos</Label>
              <Input
                id="email"
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                placeholder="facturacion@ejemplo.com"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone">Teléfono (opcional)</Label>
              <Input
                id="phone"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="809-000-0000"
              />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar datos de facturación
          </Button>
        </div>
      </Card>

      {/* Payment History */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Historial de pagos</h2>

        {payments.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No hay pagos registrados aún.
          </p>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded">
                    {payment.provider === "LEMON" ? (
                      <CreditCard className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {formatMoney(payment.amountCents, payment.currency)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(payment.createdAt), "d MMM yyyy", { locale: es })}
                    </p>
                    {payment.status === "REJECTED" && payment.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1">
                        Motivo: {payment.rejectionReason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(payment.proofs?.length ?? 0) > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const url = payment.proofs?.[0]?.url
                        if (url) window.open(url, "_blank")
                      }}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                  {getPaymentStatusBadge(payment.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
