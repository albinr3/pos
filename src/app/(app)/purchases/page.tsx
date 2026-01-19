import Link from "next/link"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PurchasesClient } from "./purchases-client"

export default function PurchasesPage() {
  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">Registra compras de mercancía para aumentar el inventario.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/purchases/scan">
              <Camera className="mr-2 h-4 w-4" />
              Escanear factura
            </Link>
          </Button>
          <div className="relative p-[3px] rounded-lg bg-gradient-to-r from-purple-dark via-purple-primary to-purple-light">
            <Button asChild variant="secondary" className="rounded-[5px]">
              <Link href="/purchases/list">Ver lista de compras</Link>
            </Button>
          </div>
        </div>
      </div>
      <PurchasesClient />
    </div>
  )
}
