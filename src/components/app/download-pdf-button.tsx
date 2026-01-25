"use client"

import { useState } from "react"
import { Download, Printer, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

export function DownloadPdfButton() {
  const [isGenerating, setIsGenerating] = useState(false)

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPdf = async () => {
    setIsGenerating(true)
    try {
      // Encontrar el elemento principal del reporte (el contenido de la página)
      const element = document.querySelector("main") || document.body
      
      // Capturar el contenido como imagen
      const canvas = await html2canvas(element, {
        scale: 2, // Mayor calidad
        useCORS: true,
        logging: false,
      })

      // Crear PDF
      const imgWidth = 210 // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight

      const pdf = new jsPDF("p", "mm", "a4")
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

      // Descargar PDF con nombre dinámico basado en la fecha
      const timestamp = new Date().toISOString().split("T")[0]
      pdf.save(`reporte-${timestamp}.pdf`)
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
        onClick={handlePrint}
        variant="outline"
        size="sm"
        title="Imprimir"
        disabled={isGenerating}
      >
        <Printer className="h-4 w-4 mr-2" />
        Imprimir
      </Button>
      <Button
        onClick={handleDownloadPdf}
        variant="outline"
        size="sm"
        title="Descargar como PDF"
        disabled={isGenerating}
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
