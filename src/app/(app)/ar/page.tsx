import Link from "next/link"
import { Receipt } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ARClient } from "./ar-client"

export default function AccountsReceivablePage() {
  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cuentas por cobrar</h1>
          <p className="text-sm text-muted-foreground">Saldar facturas o registrar abonos parciales.</p>
        </div>
        <div className="relative p-[3px] rounded-lg bg-gradient-to-r from-purple-dark via-purple-primary to-purple-light">
          <Button asChild variant="secondary" className="rounded-[5px]">
            <Link href="/payments/list">
              <Receipt className="mr-2 h-4 w-4" /> Ver Recibos
            </Link>
          </Button>
        </div>
      </div>
      <ARClient />
    </div>
  )
}
