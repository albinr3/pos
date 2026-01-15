"use client"

import { useState, useEffect } from "react"
import { Share2, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function QuoteShareButton({ quoteCode, customerPhone }: { quoteCode: string; customerPhone?: string | null }) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(customerPhone || "")
  const [canUseShareAPI, setCanUseShareAPI] = useState(false)

  useEffect(() => {
    // Verificar si el navegador soporta la Web Share API
    setCanUseShareAPI(typeof navigator !== "undefined" && "share" in navigator)
  }, [])

  async function handleNativeShare() {
    const url = window.location.href
    const message = `Hola, te comparto la cotización ${quoteCode}:\n${url}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Cotización ${quoteCode}`,
          text: message,
          url: url,
        })
      }
    } catch (error) {
      // El usuario canceló o hubo un error
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Error al compartir:", error)
      }
    }
  }

  function handleShareWhatsApp() {
    const url = window.location.href
    const message = encodeURIComponent(`Hola, te comparto la cotización ${quoteCode}:\n${url}`)
    const phoneNumber = phone.replace(/[^0-9]/g, "")
    
    if (phoneNumber) {
      window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank")
    } else {
      // Si no hay teléfono, abrir WhatsApp sin número específico
      window.open(`https://wa.me/?text=${message}`, "_blank")
    }
    setOpen(false)
  }

  function handleDownloadPDF() {
    window.print()
  }

  // Si está en móvil y tiene la API de compartir, usar directamente
  if (canUseShareAPI) {
    return (
      <>
        <Button variant="secondary" onClick={handleNativeShare}>
          <Share2 className="mr-2 h-4 w-4" />
          Compartir
        </Button>
        <Button variant="outline" onClick={handleDownloadPDF} className="ml-2">
          Descargar PDF
        </Button>
      </>
    )
  }

  // En desktop o navegadores sin soporte, mostrar el diálogo
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Share2 className="mr-2 h-4 w-4" />
        Compartir
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compartir cotización</DialogTitle>
            <DialogDescription>
              Comparte la cotización {quoteCode} por WhatsApp o descarga como PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="phone">Número de teléfono (opcional)</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="8291234567"
                inputMode="tel"
              />
              <p className="text-xs text-muted-foreground">
                Si dejas el campo vacío, se abrirá WhatsApp sin número específico.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleDownloadPDF} className="w-full sm:w-auto">
              Descargar PDF
            </Button>
            <Button onClick={handleShareWhatsApp} className="w-full sm:w-auto">
              <MessageCircle className="mr-2 h-4 w-4" />
              Compartir por WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

