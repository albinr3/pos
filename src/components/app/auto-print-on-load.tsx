"use client"

import { useEffect, useRef } from "react"

type AutoPrintOnLoadProps = {
  enabled: boolean
}

export function AutoPrintOnLoad({ enabled }: AutoPrintOnLoadProps) {
  const hasPrintedRef = useRef(false)

  useEffect(() => {
    if (!enabled || hasPrintedRef.current) return
    hasPrintedRef.current = true

    // Impresión estándar del navegador/OS: usa la impresora predeterminada del sistema.
    const timeout = window.setTimeout(() => {
      window.print()
    }, 120)

    const handleAfterPrint = () => {
      // Cerrar solo si es una ventana popup abierta por script.
      if (window.opener && !window.opener.closed) {
        window.close()
      }
    }

    window.addEventListener("afterprint", handleAfterPrint)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener("afterprint", handleAfterPrint)
    }
  }, [enabled])

  return null
}

