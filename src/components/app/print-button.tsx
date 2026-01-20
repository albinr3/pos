"use client"

import { Printer, Bluetooth } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBluetoothPrint } from "@/hooks/use-bluetooth-print"

export function PrintButton() {
  const { handlePrint, isPrinting, isConnecting, isBluetoothSupported } = useBluetoothPrint()

  return (
    <div className="flex gap-2">
      {isBluetoothSupported ? (
        <Button
          onClick={() => handlePrint(true)}
          variant="outline"
          size="sm"
          disabled={isPrinting || isConnecting}
          title="Imprimir a impresora Bluetooth"
        >
          <Bluetooth className="h-4 w-4" />
          {isConnecting ? "Conectando..." : isPrinting ? "Imprimiendo..." : "Bluetooth"}
        </Button>
      ) : null}
      <Button
        onClick={() => handlePrint(false)}
        variant="outline"
        size="sm"
        disabled={isPrinting || isConnecting}
        title="Imprimir (método estándar)"
      >
        <Printer className="h-4 w-4" />
        {isPrinting ? "Imprimiendo..." : "Imprimir"}
      </Button>
    </div>
  )
}
