"use client"

import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PrintButton() {
  const handlePrint = () => {
    window.print()
  }

  return (
    <Button
      onClick={handlePrint}
      variant="outline"
      size="sm"
      className="px-2 py-1 text-[10px] font-medium flex items-center gap-1"
      title="Imprimir recibo"
    >
      <Printer className="h-3 w-3" />
      Imprimir
    </Button>
  )
}
