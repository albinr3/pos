"use client"

import Link from "next/link"
import { useBluetoothPrint } from "@/hooks/use-bluetooth-print"
import { Bluetooth, Printer } from "lucide-react"

export function PrintToolbar({
  secondaryLink,
}: {
  secondaryLink?: { href: string; label: string }
}) {
  const { handlePrint, isPrinting, isConnecting, isBluetoothSupported } = useBluetoothPrint()

  return (
    <div className="no-print mb-2 flex items-center justify-between">
      <div className="flex gap-2">
        {isBluetoothSupported && (
          <button
            onClick={() => handlePrint(true)}
            disabled={isPrinting || isConnecting}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title="Imprimir a impresora Bluetooth"
          >
            <Bluetooth className="h-3 w-3" />
            {isConnecting
              ? "Conectando..."
              : isPrinting
                ? "Imprimiendo..."
                : "Bluetooth"}
          </button>
        )}
        <button
          onClick={() => handlePrint(false)}
          disabled={isPrinting || isConnecting}
          className="rounded bg-black px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          title="Imprimir (método estándar)"
        >
          <Printer className="h-3 w-3" />
          {isPrinting ? "Imprimiendo..." : "Imprimir"}
        </button>
      </div>
      {secondaryLink ? (
        <Link className="text-xs text-neutral-600" href={secondaryLink.href} target="_blank">
          {secondaryLink.label}
        </Link>
      ) : (
        <div />
      )}
    </div>
  )
}
