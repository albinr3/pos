import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PosClient } from "./pos-client"

export default function SalesPage() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Selecciona cliente, busca productos por descripción/código/referencia y guarda la factura.
          </p>
        </div>
        <div className="relative p-[3px] rounded-lg bg-gradient-to-r from-purple-dark via-purple-primary to-purple-light w-full sm:w-auto">
          <Button asChild variant="secondary" className="rounded-[5px] w-full sm:w-auto">
            <Link href="/sales/list">Ver lista de facturas</Link>
          </Button>
        </div>
      </div>
      <PosClient />
    </div>
  )
}
