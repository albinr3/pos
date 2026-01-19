import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ReturnsClient } from "./returns-client"

export default function ReturnsPage() {
  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nueva Devolución</h1>
          <p className="text-sm text-muted-foreground">Registra una devolución de productos de una venta.</p>
        </div>
        <div className="relative p-[3px] rounded-lg bg-gradient-to-r from-purple-dark via-purple-primary to-purple-light">
          <Button asChild variant="secondary" className="rounded-[5px]">
            <Link href="/returns/list">Ver lista de devoluciones</Link>
          </Button>
        </div>
      </div>
      <ReturnsClient />
    </div>
  )
}












