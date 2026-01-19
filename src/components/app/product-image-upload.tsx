"use client"

import { useState, useRef } from "react"
import { Upload, X, Image as ImageIcon } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

interface ProductImageUploadProps {
  images: string[]
  onChange: (images: string[]) => void
  maxImages?: number
}

export function ProductImageUpload({ images, onChange, maxImages = 3 }: ProductImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    // Validar tipo
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "El archivo debe ser una imagen" })
      return
    }

    // Validar tamaño (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Error", description: "El archivo es demasiado grande (máximo 2MB)" })
      return
    }

    // Validar cantidad máxima
    if (images.length >= maxImages) {
      toast({ title: "Error", description: `Solo puedes cargar hasta ${maxImages} imágenes` })
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload-product-image", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al subir la imagen")
      }

      const data = await response.json()
      onChange([...images, data.url])
      toast({ title: "Imagen cargada", description: "La imagen se ha subido correctamente" })
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "No se pudo subir la imagen" })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  function handleRemoveImage(index: number) {
    const newImages = images.filter((_, i) => i !== index)
    onChange(newImages)
  }

  const canUploadMore = images.length < maxImages

  return (
    <div className="space-y-4">
      {images.length === 0 ? (
        // Mostrar sección grande cuando no hay imágenes
        <div
          className="relative rounded-lg border-2 border-dashed border-purple-primary/50 bg-purple-50/50 dark:bg-purple-950/10 p-8 flex flex-col items-center justify-center cursor-pointer hover:border-purple-primary hover:bg-purple-100/50 dark:hover:bg-purple-950/20 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-primary border-t-transparent" />
              <span className="text-sm text-purple-primary font-medium">Subiendo imagen...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-purple-primary">
              <Upload className="h-12 w-12" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Carga hasta {maxImages} imágenes</p>
                <p className="text-xs text-purple-primary/80">
                  Recomendamos: Tamaño de 500 x 500 px, formato PNG y peso
                </p>
                <p className="text-xs text-purple-primary/80">máximo 2MB.</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Mostrar grid cuando hay imágenes
        <>
          <div className="grid grid-cols-3 gap-4">
            {images.map((url, index) => (
              <div key={index} className="relative group">
                <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-purple-primary/30 bg-purple-50 dark:bg-purple-950/20">
                  <Image
                    src={url}
                    alt={`Imagen ${index + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemoveImage(index)}
                  aria-label="Eliminar imagen"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}

            {canUploadMore && (
              <div
                className="relative aspect-square rounded-lg border-2 border-dashed border-purple-primary/50 bg-purple-50/50 dark:bg-purple-950/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-primary hover:bg-purple-100/50 dark:hover:bg-purple-950/20 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isUploading}
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-primary border-t-transparent" />
                    <span className="text-xs text-purple-primary">Subiendo...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-purple-primary">
                    <Upload className="h-8 w-8" />
                    <span className="text-xs font-medium text-center px-2">Cargar imagen</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {images.length < maxImages && (
            <p className="text-xs text-muted-foreground text-center">
              Puedes cargar hasta {maxImages - images.length} imagen{maxImages - images.length > 1 ? "es" : ""} más
            </p>
          )}
        </>
      )}
    </div>
  )
}
