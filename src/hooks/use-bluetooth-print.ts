"use client"

import { useState, useCallback, useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import {
  isBluetoothSupported,
  requestBluetoothPrinter,
  printToBluetoothPrinter,
  disconnectPrinter,
  type BluetoothPrinter,
} from "@/lib/bluetooth-printer"

interface UseBluetoothPrintOptions {
  onPrintComplete?: () => void
  onPrintError?: (error: Error) => void
}

export function useBluetoothPrint(options?: UseBluetoothPrintOptions) {
  const [isPrinting, setIsPrinting] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectedPrinter, setConnectedPrinter] = useState<BluetoothPrinter | null>(null)
  const [bluetoothSupported, setBluetoothSupported] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Verificar soporte de Bluetooth solo en el cliente
  useEffect(() => {
    setMounted(true)
    
    // Pequeño delay para asegurar que el DOM esté listo
    const checkSupport = () => {
      const supported = isBluetoothSupported()
      setBluetoothSupported(supported)
      
      // Debug: Log para verificar detección
      if (typeof window !== "undefined") {
        const userAgent = navigator.userAgent
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) || 
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
        const isAndroid = /android/i.test(userAgent)
        const isChrome = userAgent.toLowerCase().includes("chrome") && !userAgent.toLowerCase().includes("edg")
        const isEdge = userAgent.toLowerCase().includes("edg")
        const isSafari = userAgent.toLowerCase().includes("safari") && !userAgent.toLowerCase().includes("chrome")
        const isFirefox = userAgent.toLowerCase().includes("firefox")
        
        console.log("[Bluetooth] Detección:", {
          userAgent,
          hasBluetooth: "bluetooth" in navigator,
          isSecureContext: window.isSecureContext,
          hostname: window.location.hostname,
          protocol: window.location.protocol,
          isIOS,
          isAndroid,
          isChrome,
          isEdge,
          isSafari,
          isFirefox,
          supported,
          reason: !supported ? (
            isIOS ? "iOS no soporta Web Bluetooth" :
            isSafari ? "Safari no soporta Web Bluetooth (usa Chrome o Edge)" :
            isFirefox ? "Firefox no soporta Web Bluetooth (usa Chrome o Edge)" :
            !("bluetooth" in navigator) ? (
              isAndroid && isChrome 
                ? "Chrome Android requiere HTTPS o localhost. Accede por https:// o usa localhost en lugar de IP"
                : "Navegador no tiene API Bluetooth"
            ) :
            !window.isSecureContext && window.location.protocol !== "https:" ? 
              "Requiere HTTPS o localhost (no IPs locales con HTTP)" :
            "Desconocido"
          ) : "Soportado"
        })
      }
    }
    
    // Ejecutar inmediatamente y también después de un pequeño delay
    checkSupport()
    const timeout = setTimeout(checkSupport, 100)
    
    return () => clearTimeout(timeout)
  }, [])

  /**
   * Obtiene el contenido HTML de la página actual para imprimir
   */
  const getPrintContent = useCallback((): HTMLElement | null => {
    // Buscar el contenido principal a imprimir
    // Priorizar elementos con clases específicas de impresión
    const printElement =
      document.querySelector(".print-content") ||
      document.querySelector("[data-print-content]") ||
      document.body

    return printElement as HTMLElement
  }, [])

  /**
   * Imprime usando impresora Bluetooth
   */
  const printWithBluetooth = useCallback(
    async (printer?: BluetoothPrinter | null) => {
      if (!bluetoothSupported) {
        throw new Error("Bluetooth no está disponible en este navegador")
      }

      setIsConnecting(true)
      let printerToUse = printer

      try {
        // Si no se proporcionó una impresora, solicitar una
        if (!printerToUse) {
          printerToUse = await requestBluetoothPrinter()
          if (!printerToUse) {
            throw new Error("No se seleccionó ninguna impresora")
          }
        }

        setConnectedPrinter(printerToUse)

        // Obtener contenido a imprimir
        const content = getPrintContent()
        if (!content) {
          throw new Error("No se encontró contenido para imprimir")
        }

        setIsPrinting(true)

        // Imprimir
        await printToBluetoothPrinter(printerToUse, content)

        toast({
          title: "Impresión exitosa",
          description: `Impreso en ${printerToUse.name}`,
        })

        options?.onPrintComplete?.()
      } catch (error: any) {
        console.error("Error al imprimir con Bluetooth:", error)
        
        if (error.message?.includes("HTTPS")) {
          toast({
            title: "Error de seguridad",
            description: "Se requiere HTTPS para usar Bluetooth (excepto en localhost)",
            variant: "destructive",
          })
        } else if (error.message?.includes("No se seleccionó")) {
          // Usuario canceló la selección, no mostrar error
          return
        } else {
          toast({
            title: "Error al imprimir",
            description: error.message || "Ocurrió un error al imprimir",
            variant: "destructive",
          })
        }

        options?.onPrintError?.(error)
        throw error
      } finally {
        setIsPrinting(false)
        setIsConnecting(false)
      }
    },
    [getPrintContent, options]
  )

  /**
   * Imprime usando el método estándar (fallback)
   */
  const printStandard = useCallback(() => {
    window.print()
    if (options?.onPrintComplete) {
      setTimeout(() => {
        options.onPrintComplete?.()
      }, 100)
    }
  }, [options])

  /**
   * Función principal de impresión que intenta Bluetooth primero, luego fallback
   */
  const handlePrint = useCallback(
    async (preferBluetooth: boolean = true) => {
      if (preferBluetooth && bluetoothSupported) {
        try {
          await printWithBluetooth()
          return
        } catch (error) {
          // Si falla Bluetooth, continuar con método estándar
          console.log("Fallback a impresión estándar")
        }
      }

      // Fallback a impresión estándar
      printStandard()
    },
    [printWithBluetooth, printStandard, bluetoothSupported]
  )

  /**
   * Desconecta la impresora Bluetooth actual
   */
  const disconnect = useCallback(async () => {
    if (connectedPrinter) {
      try {
        await disconnectPrinter(connectedPrinter)
        setConnectedPrinter(null)
      } catch (error) {
        console.error("Error al desconectar impresora:", error)
      }
    }
  }, [connectedPrinter])

  return {
    handlePrint,
    printWithBluetooth,
    printStandard,
    disconnect,
    isPrinting,
    isConnecting,
    connectedPrinter,
    isBluetoothSupported: mounted && bluetoothSupported,
  }
}
