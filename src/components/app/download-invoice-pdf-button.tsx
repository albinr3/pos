"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

interface DownloadInvoicePdfButtonProps {
  filename?: string
}

export function DownloadInvoicePdfButton({ 
  filename = "factura" 
}: DownloadInvoicePdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  const handleDownloadPdf = async () => {
    setIsGenerating(true)
    try {
      // Encontrar el elemento con la clase print-content (la factura)
      const element = document.querySelector(".print-content") as HTMLElement
      
      if (!element) {
        throw new Error("No se encontró el contenido de la factura")
      }

      // Capturar el contenido como imagen
      const canvas = await html2canvas(element, {
        scale: 2, // Buena calidad para documentos A4
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      })

      // Crear PDF en formato A4
      const pdf = new jsPDF("p", "mm", "a4")
      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      // Agregar imagen al PDF
      const imgData = canvas.toDataURL("image/png")
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      // Si el contenido es más alto que una página, agregar más páginas
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

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
    <div className="flex gap-2">
      <Button
        onClick={handleDownloadPdf}
        disabled={isGenerating}
        variant="default"
        size="sm"
        className="bg-green-600 hover:bg-green-700"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generando...
          </>
        ) : (
          <>
            <Download className="h-4 w-4 mr-2" />
            Descargar PDF
          </>
        )}
      </Button>
    </div>
  )
}
