"use client"

import { UploadButton } from "@uploadthing/react"
import type { OurFileRouter } from "@/app/api/uploadthing/core"
import { Upload, X } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

interface ProductImageUploadProps {
  images: string[]
  onChange: (images: string[]) => void
  maxImages?: number
}

export function ProductImageUpload({ 
  images, 
  onChange, 
  maxImages = 3 
}: ProductImageUploadProps) {
  const handleUploadComplete = (res: Array<{ url: string }>) => {
    if (res && res.length > 0) {
      const newUrls = res.map((file) => file.url)
      const updatedImages = [...images, ...newUrls].slice(0, maxImages)
      onChange(updatedImages)
      toast({ 
        title: "Imagen cargada", 
        description: "La imagen se ha subido correctamente" 
      })
    }
  }

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index)
    onChange(newImages)
  }

  const canUploadMore = images.length < maxImages

  return (
    <div className="space-y-4">
      {images.length === 0 ? (
        <div className="relative rounded-lg border-2 border-dashed border-purple-primary/50 bg-purple-50/50 dark:bg-purple-950/10 p-8">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <Upload className="h-6 w-6 text-purple-primary" aria-hidden="true" />
            <p className="text-sm font-medium text-purple-primary">Cargar imagenes</p>
            <p className="text-xs text-muted-foreground">
              Puedes cargar hasta {maxImages} imagenes. Maximo 2MB cada una.
            </p>
          </div>
          <UploadButton<OurFileRouter, "productImageUploader">
            endpoint="productImageUploader"
            onClientUploadComplete={handleUploadComplete}
            onUploadError={(error: Error) => {
              toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
              })
            }}
            className="absolute inset-0 z-10"
            appearance={{
              container: "h-full w-full",
              button: "h-full w-full mt-0 bg-transparent text-transparent hover:bg-transparent after:hidden",
              allowedContent: "hidden",
            }}
            content={{
              button() {
                return <span className="sr-only">Cargar imagenes</span>
              },
            }}
          />
        </div>
      ) : (
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
              <div className="relative aspect-square rounded-lg border-2 border-dashed border-purple-primary/50 bg-purple-50/50 dark:bg-purple-950/10">
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
                  <Upload className="h-5 w-5 text-purple-primary" aria-hidden="true" />
                  <span className="text-xs font-medium text-purple-primary">Agregar</span>
                </div>
                <UploadButton<OurFileRouter, "productImageUploader">
                  endpoint="productImageUploader"
                  onClientUploadComplete={handleUploadComplete}
                  onUploadError={(error: Error) => {
                    toast({
                      title: "Error",
                      description: error.message,
                      variant: "destructive",
                    })
                  }}
                  className="absolute inset-0 z-10"
                  appearance={{
                    container: "h-full w-full",
                    button: "h-full w-full mt-0 bg-transparent text-transparent hover:bg-transparent after:hidden",
                    allowedContent: "hidden",
                  }}
                  content={{
                    button() {
                      return <span className="sr-only">Agregar imagen</span>
                    },
                  }}
                />
              </div>
            )}
          </div>

          {images.length < maxImages && (
            <p className="text-xs text-muted-foreground text-center">
              Puedes cargar hasta {maxImages - images.length} imagen{maxImages - images.length > 1 ? "es" : ""} mas
            </p>
          )}
        </>
      )}
    </div>
  )
}
