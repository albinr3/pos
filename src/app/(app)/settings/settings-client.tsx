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

import { getSettings, updateAllowNegativeStock } from "./actions"
import { updateCompanyInfo } from "./company-actions"

export function SettingsClient() {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [allowNegativeStock, setAllowNegativeStock] = useState(false)
  const [isSaving, startSaving] = useTransition()

  useEffect(() => {
    getSettings().then((s) => {
      setName(s.name)
      setPhone(s.phone)
      setAddress(s.address)
      setLogoUrl(s.logoUrl)
      setAllowNegativeStock(s.allowNegativeStock)
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

  function onToggle(v: boolean) {
    setAllowNegativeStock(v)
    startSaving(async () => {
      try {
        await updateAllowNegativeStock(v)
        toast({ title: "Ajustes guardados" })
      } catch (e) {
        toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo guardar" })
      }
    })
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
          <CardTitle>Inventario</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="text-sm text-muted-foreground">Comportamiento al facturar con stock insuficiente.</div>
          <Separator />
          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div className="grid gap-1">
              <Label className="font-semibold">Permitir vender sin stock</Label>
              <div className="text-xs text-muted-foreground">
                Si está activo, se permite facturar aunque el inventario no alcance (el stock puede quedar negativo).
              </div>
            </div>
            <Switch checked={allowNegativeStock} onCheckedChange={onToggle} disabled={isSaving} />
          </div>
        </CardContent>
      </Card>

      {/*
        Auth (comentado):
        Aquí luego podemos agregar: Usuarios, Roles, Permisos, Login.
        Ya existe la tabla User y el campo canOverridePrice.
      */}
    </div>
  )
}
