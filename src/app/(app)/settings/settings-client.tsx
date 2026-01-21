"use client"

import { useEffect, useState, useTransition } from "react"
import { X, Image as ImageIcon, RefreshCw, WifiOff, Database } from "lucide-react"
import Image from "next/image"
import { UploadButton } from "@uploadthing/react"
import type { OurFileRouter } from "@/app/api/uploadthing/core"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import { useOnlineStatus } from "@/hooks/use-online-status"
import { getPendingCounts } from "@/lib/indexed-db"
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

import { getSettings, updateLabelSizes } from "./actions"
import { updateCompanyInfo } from "./company-actions"
import { UsersTab } from "./users-tab"

type Props = {
  isOwner: boolean
}

export function SettingsClient({ isOwner }: Props) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const [barcodeLabelSize, setBarcodeLabelSize] = useState("4x2")
  const [shippingLabelSize, setShippingLabelSize] = useState("4x6")
  const [isSaving, startSaving] = useTransition()
  const isOnline = useOnlineStatus()
  const [pendingCounts, setPendingCounts] = useState({ sales: 0, payments: 0 })
  const [isSyncing, setIsSyncing] = useState(false)
  const [isPreloading, setIsPreloading] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setName(s.name)
      setPhone(s.phone)
      setAddress(s.address)
      setLogoUrl(s.logoUrl)
      setBarcodeLabelSize(s.barcodeLabelSize)
      setShippingLabelSize(s.shippingLabelSize)
    })
    
    // Actualizar contadores de pendientes
    const updatePendingCounts = async () => {
      const counts = await getPendingCounts()
      setPendingCounts(counts)
    }
    updatePendingCounts()
    const interval = setInterval(updatePendingCounts, 5000)
    
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
    try {
      await updateCompanyInfo({ name, phone, address, logoUrl: null })
      setLogoUrl(null)
      toast({ title: "Logo eliminado" })
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo eliminar el logo" })
    }
  }

  function onSaveCompany() {
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
                <UploadButton<OurFileRouter>
                  endpoint="logoUploader"
                  onClientUploadComplete={(res) => {
                    if (res?.[0]?.url) {
                      handleLogoUpload(res[0].url)
                    }
                  }}
                  onUploadError={(error: Error) => {
                    toast({
                      title: "Error",
                      description: error.message,
                      variant: "destructive",
                    })
                  }}
                  content={{
                    button({ ready, isUploading }) {
                      if (isUploading) return "Subiendo..."
                      if (ready) return logoUrl ? "Cambiar logo" : "Subir logo"
                      return "Preparando..."
                    },
                    allowedContent({ ready, fileTypes, isUploading }) {
                      if (!ready) return "Preparando..."
                      if (isUploading) return "Subiendo..."
                      return `Formatos: JPG, PNG, GIF. Máximo 5MB`
                    },
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Formatos: JPG, PNG, GIF. Máximo 5MB
                </p>
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid gap-2">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Teléfono</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Dirección</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={onSaveCompany} disabled={isSaving}>
              Guardar empresa
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Etiquetas de Impresión</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="text-sm text-muted-foreground">Configura los tamaños de las etiquetas para impresión.</div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Etiqueta de Código de Barras</Label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={barcodeLabelSize}
                onChange={(e) => setBarcodeLabelSize(e.target.value)}
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
              disabled={isSaving}
            >
              Guardar etiquetas
            </Button>
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
              <p>• Los datos se sincronizan automáticamente cuando vuelve la conexión</p>
              <p>• Pre-carga los datos cuando tengas conexión para usarlos offline</p>
              <p>• Las ventas y pagos realizados offline se guardan localmente</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isOwner && <UsersTab isOwner={isOwner} />}
    </div>
  )
}
