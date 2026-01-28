"use client"

import Link from "next/link"
import { useBluetoothPrint } from "@/hooks/use-bluetooth-print"
import { Bluetooth, Printer, Smartphone, Share2 } from "lucide-react"
import { printViaScheme, shareReceiptAsImage } from "@/lib/printer-scheme"
import { useState, useEffect } from "react"

export function PrintToolbar({
  secondaryLink,
}: {
  secondaryLink?: { href: string; label: string }
}) {
  const { handlePrint, isPrinting, isConnecting, isBluetoothSupported } = useBluetoothPrint()
  const [isIOS, setIsIOS] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    const userAgent = navigator.userAgent || ""
    const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    setIsIOS(isIOSDevice)
  }, [])

  // Handler síncrono para Android (RawBT) para evitar perder el "User Activation"
  const handleRawBT = () => {
    const printElement =
      document.querySelector(".print-content") ||
      document.querySelector("[data-print-content]") ||
      document.body

    if (printElement) {
      printViaScheme(printElement as HTMLElement)
    }
  }

  // Handler asíncrono para iOS (Share)
  const handleIOSShare = async () => {
    const printElement =
      document.querySelector(".print-content") ||
      document.querySelector("[data-print-content]") ||
      document.body

    if (!printElement) return

    setIsGenerating(true)
    try {
      await shareReceiptAsImage(printElement as HTMLElement)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSmartPrint = () => {
    if (isIOS) {
      handleIOSShare()
    } else {
      handleRawBT()
    }
  }

  return (
    <div className="no-print mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {isBluetoothSupported && (
          <button
            onClick={() => handlePrint(true)}
            disabled={isPrinting || isConnecting || isGenerating}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title="Imprimir a impresora Bluetooth (Solo PC/Android)"
          >
            <Bluetooth className="h-3 w-3" />
            {isConnecting
              ? "Conectando..."
              : isPrinting
                ? "Imprimiendo..."
                : "Bluetooth (PC)"}
          </button>
        )}

        <button
          onClick={handleSmartPrint}
          disabled={isGenerating}
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 flex items-center gap-1 disabled:opacity-50"
          title={isIOS ? "Compartir para imprimir (iPhone)" : "Imprimir usando App externa (RawBT en Android)"}
        >
          {isIOS ? <Share2 className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
          {isGenerating ? "Generando..." : isIOS ? "Compartir / App" : "App (RawBT)"}
        </button>

        <button
          onClick={() => handlePrint(false)}
          disabled={isPrinting || isConnecting || isGenerating}
          className="rounded bg-black px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          title="Imprimir (método estándar)"
        >
          <Printer className="h-3 w-3" />
          {isPrinting ? "Imprimiendo..." : "PDF / General"}
        </button>
      </div>
      {secondaryLink ? (
        <Link className="text-xs text-neutral-600 hover:underline" href={secondaryLink.href} target="_blank">
          {secondaryLink.label}
        </Link>
      ) : (
        <div />
      )}
    </div>
  )
}
