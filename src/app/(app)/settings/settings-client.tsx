"use client"

import { useEffect, useState, useTransition, useRef } from "react"
import { Upload, X, Image as ImageIcon } from "lucide-react"
import Image from "next/image"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"

import { getSettings, updateLabelSizes } from "./actions"
import { updateCompanyInfo } from "./company-actions"
import { PermissionsTab } from "./permissions-tab"

export function SettingsClient() {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [barcodeLabelSize, setBarcodeLabelSize] = useState("4x2")
  const [shippingLabelSize, setShippingLabelSize] = useState("4x6")
  const [isSaving, startSaving] = useTransition()

  useEffect(() => {
    getSettings().then((s) => {
      setName(s.name)
      setPhone(s.phone)
      setAddress(s.address)
      setLogoUrl(s.logoUrl)
      setBarcodeLabelSize(s.barcodeLabelSize)
      setShippingLabelSize(s.shippingLabelSize)
    })
  }, [])

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    // Validar tipo
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "El archivo debe ser una imagen" })
      return
    }

    // Validar tamaño (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "El archivo es demasiado grande (máximo 5MB)" })
      return
    }

    setIsUploadingLogo(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload-logo", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al subir el logo")
      }

      const data = await response.json()
      setLogoUrl(data.url)

      // Guardar en la base de datos
      await updateCompanyInfo({ name, phone, address, logoUrl: data.url })
      toast({ title: "Logo actualizado" })
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo subir el logo" })
    } finally {
      setIsUploadingLogo(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  id="logo-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="w-fit"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {isUploadingLogo ? "Subiendo..." : logoUrl ? "Cambiar logo" : "Subir logo"}
                </Button>
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

      <PermissionsTab />
    </div>
  )
}
