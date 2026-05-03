"use client"

import { useEffect, useState, useTransition } from "react"
import { X, Image as ImageIcon, RefreshCw, WifiOff, Database, Upload } from "lucide-react"
import Image from "next/image"
import { UploadButton } from "@uploadthing/react"
import type { OurFileRouter } from "@/app/api/uploadthing/core"
import type { UserRole } from "@prisma/client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import { useOnlineStatus } from "@/hooks/use-online-status"
import { getPendingCounts } from "@/lib/indexed-db"
import { markCacheSynced } from "@/lib/auto-sync"
import { syncPendingData } from "@/lib/sync-manager"
import {
  syncProductsToIndexedDB,
  syncCustomersToIndexedDB,
  syncARToIndexedDB,
} from "@/app/(app)/sync/actions"
import {
  saveProductsCache,
  saveCustomersCache,
  saveARCache,
} from "@/lib/indexed-db"

import { getSettings, updateLabelSizes, updateSalesSettings, updateReceiptSettings, updatePurchasePricingSettings, updatePrintFormats, updateSalePriceTaxMode, updateLegalTipSetting } from "./actions"
import { updateCompanyInfo } from "./company-actions"
import { UsersTab } from "./users-tab"
import { AuditLogPanel } from "./audit-log-panel"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { InventoryRecoveryCard } from "./inventory-recovery-card"

const CACHE_SYNC_KEY = "tejada-pos-cache-sync"

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseLastSyncDay(raw: string | null) {
  if (!raw) return null
  if (/^\d+$/.test(raw)) {
    const ts = Number(raw)
    if (!Number.isNaN(ts)) return formatDateKey(new Date(ts))
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return null
}

type Props = {
  isOwner: boolean
  role: UserRole
  canManageUsers: boolean
  canViewAuditLogs: boolean
  canManageSettings: boolean
}

export function SettingsClient({ isOwner, role, canManageUsers, canViewAuditLogs, canManageSettings }: Props) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const [barcodeLabelSize, setBarcodeLabelSize] = useState("4x2")
  const [shippingLabelSize, setShippingLabelSize] = useState("4x6")
  const [defaultViewMode, setDefaultViewMode] = useState("list")
  const [defaultProfitMargin, setDefaultProfitMargin] = useState("30.00")
  const [salePricesIncludeItbis, setSalePricesIncludeItbis] = useState(true)
  const [showItbisOnReceipts, setShowItbisOnReceipts] = useState(true)
  const [legalTipEnabled, setLegalTipEnabled] = useState(false)

  const [salePrintFormat, setSalePrintFormat] = useState("80mm")
  const [quotePrintFormat, setQuotePrintFormat] = useState("80mm")
  const [paymentPrintFormat, setPaymentPrintFormat] = useState("80mm")
  const [returnPrintFormat, setReturnPrintFormat] = useState("80mm")

  const [isSaving, startSaving] = useTransition()
  const isOnline = useOnlineStatus()
  const [pendingCounts, setPendingCounts] = useState({ sales: 0, payments: 0 })
  const [isSyncing, setIsSyncing] = useState(false)
  const [isPreloading, setIsPreloading] = useState(false)
  const [lastPreloadDay, setLastPreloadDay] = useState<string | null>(null)
  const logoActionLabel = logoUrl ? "Cambiar logo" : "Subir logo"
  const canEditSettings = isOwner || canManageSettings
  const canSeeUsers = isOwner || canManageUsers
  const canSeeAudit = isOwner || canViewAuditLogs
  const canManageBulkRecovery = isOwner || role === "ADMIN"

  useEffect(() => {
    getSettings().then((s) => {
      setName(s.name)
      setPhone(s.phone)
      setAddress(s.address)
      setLogoUrl(s.logoUrl)
      setBarcodeLabelSize(s.barcodeLabelSize)
      setShippingLabelSize(s.shippingLabelSize)
      setDefaultViewMode(s.defaultViewMode)
      setDefaultProfitMargin((s.defaultProfitMarginBp / 100).toFixed(2))
      setSalePricesIncludeItbis(s.salePricesIncludeItbis)
      setShowItbisOnReceipts(s.showItbisOnReceipts)
      setLegalTipEnabled(s.legalTipEnabled ?? false)
      setSalePrintFormat(s.salePrintFormat ?? "80mm")
      setQuotePrintFormat(s.quotePrintFormat ?? "80mm")
      setPaymentPrintFormat(s.paymentPrintFormat ?? "80mm")
      setReturnPrintFormat(s.returnPrintFormat ?? "80mm")
    })

    // Actualizar contadores de pendientes
    const updatePendingCounts = async () => {
      const counts = await getPendingCounts()
      setPendingCounts(counts)
    }
    updatePendingCounts()
    const interval = setInterval(updatePendingCounts, 5000)

    if (typeof window !== "undefined") {
      setLastPreloadDay(parseLastSyncDay(localStorage.getItem(CACHE_SYNC_KEY)))
    }

    return () => clearInterval(interval)
  }, [])

  async function handleSync() {
    if (!isOnline) {
      toast({
        title: "Sin conexión",
        description: "No puedes sincronizar sin conexión a internet",
        variant: "destructive",
      })
      return
    }

    setIsSyncing(true)
    try {
      await syncPendingData()
      const counts = await getPendingCounts()
      setPendingCounts(counts)
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al sincronizar",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handlePreload() {
    if (!isOnline) {
      toast({
        title: "Sin conexión",
        description: "No puedes pre-cargar datos sin conexión a internet",
        variant: "destructive",
      })
      return
    }

    setIsPreloading(true)
    try {
      const [productsData, customersData, arData] = await Promise.all([
        syncProductsToIndexedDB(),
        syncCustomersToIndexedDB(),
        syncARToIndexedDB(),
      ])

      await Promise.all([
        saveProductsCache(productsData),
        saveCustomersCache(customersData),
        saveARCache(arData),
      ])
      markCacheSynced()
      setLastPreloadDay(formatDateKey(new Date()))

      toast({
        title: "Datos pre-cargados",
        description: "Los datos están listos para usar en modo offline",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al pre-cargar datos",
        variant: "destructive",
      })
    } finally {
      setIsPreloading(false)
    }
  }

  async function handleLogoUpload(url: string) {
    if (!canEditSettings) return
    try {
      setLogoUrl(url)
      // Guardar en la base de datos
      await updateCompanyInfo({ name, phone, address, logoUrl: url })
      toast({ title: "Logo actualizado" })
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar el logo" })
    }
  }

  async function handleRemoveLogo() {
    if (!canEditSettings) return
    try {
      await updateCompanyInfo({ name, phone, address, logoUrl: null })
      setLogoUrl(null)
      toast({ title: "Logo eliminado" })
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo eliminar el logo" })
    }
  }

  function onSaveCompany() {
    if (!canEditSettings) return
    startSaving(async () => {
      try {
        await updateCompanyInfo({ name, phone, address, logoUrl })
        toast({ title: "Empresa actualizada" })
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
      }
    })
  }

  return (
    <div className="grid gap-6">
      {!canEditSettings && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo puedes visualizar esta sección. Se requiere permiso para modificar ajustes de empresa.
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="relative">
                  <div className="relative h-20 w-20 overflow-hidden rounded-md border">
                    <Image
                      src={logoUrl}
                      alt="Logo de la empresa"
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleRemoveLogo}
                    disabled={!canEditSettings}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="relative w-44">
                  <div className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/30 text-center">
                    <Upload className="h-5 w-5 text-purple-primary" aria-hidden="true" />
                    <span className="text-sm font-medium text-purple-primary">{logoActionLabel}</span>
                    <span className="text-[11px] text-muted-foreground">JPG, PNG, GIF. Maximo 5MB</span>
                  </div>
                  <UploadButton<OurFileRouter, "logoUploader">
                    endpoint="logoUploader"
                    onClientUploadComplete={(res) => {
                      if (res?.[0]?.ufsUrl || res?.[0]?.url) {
                        handleLogoUpload(res[0].ufsUrl ?? res[0].url)
                      }
                    }}
                    onUploadError={(error: Error) => {
                      toast({
                        title: "Error",
                        description: error.message,
                        variant: "destructive",
                      })
                    }}
                    className="absolute inset-0 z-10"
                    disabled={!canEditSettings}
                    appearance={{
                      container: "h-full w-full",
                      button: "h-full w-full mt-0 bg-transparent text-transparent hover:bg-transparent after:hidden",
                      allowedContent: "hidden",
                    }}
                    content={{
                      button() {
                        return <span className="sr-only">{logoActionLabel}</span>
                      },
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid gap-2">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEditSettings} />
          </div>
          <div className="grid gap-2">
            <Label>Teléfono</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEditSettings} />
          </div>
          <div className="grid gap-2">
            <Label>Dirección</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canEditSettings} />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={onSaveCompany} disabled={isSaving || !canEditSettings}>
              Guardar empresa
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Impresión y Etiquetas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="text-sm text-muted-foreground">Configura los formatos por defecto y tamaños de etiquetas para impresión.</div>
          <Separator />
          
          <div className="text-sm font-semibold">Formatos de Impresión por Defecto</div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Ventas (Facturas)</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={salePrintFormat}
                onChange={(e) => {
                  if (!canEditSettings) return
                  const newValue = e.target.value
                  setSalePrintFormat(newValue)
                  startSaving(async () => {
                    try {
                      await updatePrintFormats({ sale: newValue, quote: quotePrintFormat, payment: paymentPrintFormat, returnFormat: returnPrintFormat })
                      toast({ title: "Formato guardado" })
                    } catch (err) {
                      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" })
                    }
                  })
                }}
                disabled={!canEditSettings || isSaving}
              >
                <option value="80mm">80mm</option>
                <option value="CARTA">Hoja Carta (A4)</option>
              </select>
            </div>
            
            <div className="grid gap-2">
              <Label>Cotizaciones</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={quotePrintFormat}
                onChange={(e) => {
                  if (!canEditSettings) return
                  const newValue = e.target.value
                  setQuotePrintFormat(newValue)
                  startSaving(async () => {
                    try {
                      await updatePrintFormats({ sale: salePrintFormat, quote: newValue, payment: paymentPrintFormat, returnFormat: returnPrintFormat })
                      toast({ title: "Formato guardado" })
                    } catch (err) {
                      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" })
                    }
                  })
                }}
                disabled={!canEditSettings || isSaving}
              >
                <option value="80mm">80mm</option>
                <option value="CARTA">Hoja Carta (A4)</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label>Recibos de Pago</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={paymentPrintFormat}
                onChange={(e) => {
                  if (!canEditSettings) return
                  const newValue = e.target.value
                  setPaymentPrintFormat(newValue)
                  startSaving(async () => {
                    try {
                      await updatePrintFormats({ sale: salePrintFormat, quote: quotePrintFormat, payment: newValue, returnFormat: returnPrintFormat })
                      toast({ title: "Formato guardado" })
                    } catch (err) {
                      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" })
                    }
                  })
                }}
                disabled={!canEditSettings || isSaving}
              >
                <option value="80mm">80mm</option>
                <option value="CARTA">Hoja Carta (A4)</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label>Devoluciones</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={returnPrintFormat}
                onChange={(e) => {
                  if (!canEditSettings) return
                  const newValue = e.target.value
                  setReturnPrintFormat(newValue)
                  startSaving(async () => {
                    try {
                      await updatePrintFormats({ sale: salePrintFormat, quote: quotePrintFormat, payment: paymentPrintFormat, returnFormat: newValue })
                      toast({ title: "Formato guardado" })
                    } catch (err) {
                      toast({ title: "Error", description: err instanceof Error ? err.message : "Error", variant: "destructive" })
                    }
                  })
                }}
                disabled={!canEditSettings || isSaving}
              >
                <option value="80mm">80mm</option>
                <option value="CARTA">Hoja Carta (A4)</option>
              </select>
            </div>
          </div>
          <Separator />
          
          <div className="text-sm font-semibold">Tamaños de Etiquetas</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Etiqueta de Código de Barras</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={barcodeLabelSize}
                onChange={(e) => setBarcodeLabelSize(e.target.value)}
                disabled={!canEditSettings}
              >
                <option value="4x2">4&quot; x 2&quot; (101.6mm x 50.8mm) - Estándar</option>
                <option value="3x1">3&quot; x 1&quot; (76.2mm x 25.4mm) - Pequeña</option>
                <option value="2x1">2&quot; x 1&quot; (50.8mm x 25.4mm) - Mini</option>
                <option value="2.25x1.25">2.25&quot; x 1.25&quot; (57mm x 32mm) - Térmica</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Etiqueta de Envío</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={shippingLabelSize}
                onChange={(e) => setShippingLabelSize(e.target.value)}
                disabled={!canEditSettings}
              >
                <option value="4x6">4&quot; x 6&quot; (101.6mm x 152.4mm) - Estándar</option>
                <option value="4x4">4&quot; x 4&quot; (101.6mm x 101.6mm) - Cuadrada</option>
                <option value="6x4">6&quot; x 4&quot; (152.4mm x 101.6mm) - Horizontal</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                startSaving(async () => {
                  try {
                    await updateLabelSizes(barcodeLabelSize, shippingLabelSize)
                    toast({ title: "Tamaños de etiquetas actualizados" })
                  } catch (e) {
                    toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
                  }
                })
              }}
              disabled={isSaving || !canEditSettings}
            >
              Guardar etiquetas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuración de Ventas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="text-sm text-muted-foreground">Personaliza el comportamiento de la ventana de ventas.</div>
          <Separator />
          <div className="grid gap-2">
            <Label>Vista por defecto de productos en Ventas</Label>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm w-full md:w-[300px]"
              value={defaultViewMode}
              onChange={(e) => {
                if (!canEditSettings) return
                const newValue = e.target.value
                setDefaultViewMode(newValue)
                startSaving(async () => {
                  try {
                    await updateSalesSettings(newValue)
                    toast({ title: "Preferencia guardada" })
                  } catch (e) {
                    toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
                  }
                })
              }}
              disabled={!canEditSettings}
            >
              <option value="list">Lista (texto y campos compactos)</option>
              <option value="grid">Imágenes (cuadrícula con fotos)</option>
            </select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Precio de venta incluye ITBIS</Label>
              <div className="text-sm text-muted-foreground">
                Si se desactiva, el precio de venta será base sin ITBIS y el total sumará el impuesto.
              </div>
            </div>
            <Switch
              checked={salePricesIncludeItbis}
              onCheckedChange={(checked) => {
                if (!canEditSettings) return
                setSalePricesIncludeItbis(checked)
                startSaving(async () => {
                  try {
                    await updateSalePriceTaxMode(checked)
                    toast({ title: "Preferencia guardada" })
                  } catch (e) {
                    toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
                  }
                })
              }}
              disabled={isSaving || !canEditSettings}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Desglosar ITBIS en recibos</Label>
              <div className="text-sm text-muted-foreground">
                Si se activa, se mostrará el detalle del ITBIS en los recibos y facturas (térmica y carta).
              </div>
            </div>
            <Switch
              checked={showItbisOnReceipts}
              onCheckedChange={(checked) => {
                if (!canEditSettings) return
                setShowItbisOnReceipts(checked)
                startSaving(async () => {
                  try {
                    await updateReceiptSettings(checked)
                    toast({ title: "Preferencia guardada" })
                  } catch (e) {
                    toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
                  }
                })
              }}
              disabled={isSaving || !canEditSettings}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Habilitar propina legal (10%)</Label>
              <div className="text-sm text-muted-foreground">
                Al activarlo, en facturación aparecerá la opción para cobrar la propina legal del 10%.
              </div>
            </div>
            <Switch
              checked={legalTipEnabled}
              onCheckedChange={(checked) => {
                if (!canEditSettings) return
                setLegalTipEnabled(checked)
                startSaving(async () => {
                  try {
                    await updateLegalTipSetting(checked)
                    toast({ title: "Preferencia guardada" })
                  } catch (e) {
                    toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
                  }
                })
              }}
              disabled={isSaving || !canEditSettings}
            />
          </div>


          <div className="grid gap-2">
            <Label>% ganancia por defecto en compras</Label>
            <div className="flex items-center gap-2">
              <Input
                value={defaultProfitMargin}
                onChange={(e) => {
                  if (!canEditSettings) return
                  const cleaned = e.target.value.replace(/[^0-9.]/g, "")
                  const parts = cleaned.split(".")
                  if (parts.length > 2) return
                  const normalized = parts.length === 2 ? `${parts[0]}.${parts[1].slice(0, 2)}` : parts[0]
                  setDefaultProfitMargin(normalized)
                }}
                inputMode="decimal"
                className="w-full md:w-[180px]"
                disabled={!canEditSettings}
              />
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || !canEditSettings}
                onClick={() => {
                  if (!canEditSettings) return
                  startSaving(async () => {
                    try {
                      const parsedMargin = Number.parseFloat(defaultProfitMargin || "0")
                      const marginBp = Math.round((Number.isFinite(parsedMargin) ? parsedMargin : 0) * 100)
                      await updatePurchasePricingSettings(marginBp)
                      setDefaultProfitMargin((marginBp / 100).toFixed(2))
                      toast({ title: "Ganancia por defecto guardada" })
                    } catch (e) {
                      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
                    }
                  })
                }}
              >
                Guardar
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Este porcentaje se usa para calcular el precio de venta automático en compras.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modo Offline</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="text-sm text-muted-foreground">
            Gestiona la sincronización de datos para usar la aplicación sin conexión a internet.
          </div>
          <Separator />

          <div className="grid gap-4">
            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="flex items-center gap-3">
                {isOnline ? (
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-yellow-600" />
                )}
                <div>
                  <div className="font-medium">
                    {isOnline ? "Conectado" : "Sin conexión"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isOnline
                      ? "La aplicación está conectada a internet"
                      : "La aplicación está funcionando en modo offline"}
                  </div>
                </div>
              </div>
            </div>

            {(pendingCounts.sales > 0 || pendingCounts.payments > 0) && (
              <div className="rounded-md border border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-900/20">
                <div className="font-medium text-yellow-800 dark:text-yellow-200">
                  Datos pendientes de sincronizar
                </div>
                <div className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                  {pendingCounts.sales > 0 && `${pendingCounts.sales} venta(s)`}
                  {pendingCounts.sales > 0 && pendingCounts.payments > 0 && " • "}
                  {pendingCounts.payments > 0 && `${pendingCounts.payments} pago(s)`}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSync}
                disabled={isSyncing || !isOnline || (pendingCounts.sales === 0 && pendingCounts.payments === 0)}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Sincronizando..." : "Sincronizar ahora"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreload}
                disabled={isPreloading || !isOnline}
              >
                <Database className={`mr-2 h-4 w-4 ${isPreloading ? "animate-spin" : ""}`} />
                {isPreloading ? "Pre-cargando..." : "Pre-cargar datos offline"}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Ultima precarga: {lastPreloadDay ?? "sin registro"}
            </div>

            <div className="text-xs text-muted-foreground">
              <p>• Los datos se sincronizan automáticamente cuando vuelve la conexión</p>
              <p>• Pre-carga los datos cuando tengas conexión para usarlos offline</p>
              <p>• Las ventas y pagos realizados offline se guardan localmente</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <InventoryRecoveryCard canManage={canManageBulkRecovery} />

      {canSeeUsers && <UsersTab isOwner={isOwner} canManageUsers={canSeeUsers} />}
      {canSeeAudit && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="audit-log">
            <AccordionTrigger className="text-left text-base font-semibold">
              Registro de auditoría
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <AuditLogPanel />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
