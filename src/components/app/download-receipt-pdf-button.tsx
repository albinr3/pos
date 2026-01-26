"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

interface DownloadReceiptPdfButtonProps {
  filename?: string
  secondaryLink?: { href: string; label: string }
}

export function DownloadReceiptPdfButton({ 
  filename = "recibo", 
  secondaryLink 
}: DownloadReceiptPdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  const handleDownloadPdf = async () => {
    setIsGenerating(true)
    try {
      // Encontrar el elemento con la clase print-content (el recibo)
      const element = document.querySelector(".print-content") as HTMLElement
      
      if (!element) {
        throw new Error("No se encontró el contenido del recibo")
      }

      // Capturar el contenido como imagen con alta calidad
      const canvas = await html2canvas(element, {
        scale: 3, // Alta calidad para recibos pequeños
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      })

      // Para recibos de 80mm, usamos un tamaño personalizado
      // 80mm = 3.15 inches ≈ 226.77 points
      const imgWidth = 80 // mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Crear PDF con ancho de 80mm y altura automática
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [imgWidth, imgHeight],
      })

      // Agregar imagen al PDF
      const imgData = canvas.toDataURL("image/png")
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight)

      // Descargar PDF con nombre dinámico
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T")[0]
      pdf.save(`${filename}-${timestamp}.pdf`)
    } catch (error) {
      console.error("Error generando PDF:", error)
      alert("Error al generar el PDF. Por favor intenta de nuevo.")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Button
      onClick={handleDownloadPdf}
      disabled={isGenerating}
      className="rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
      size="sm"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Generando...
        </>
      ) : (
        <>
          <Download className="h-3 w-3" />
          PDF
        </>
      )}
    </Button>
  )
}
