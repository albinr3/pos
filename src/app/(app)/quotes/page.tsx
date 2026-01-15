import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"
import { QuotesClient } from "./quotes-client"

export default function QuotesPage() {
  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Crea y gestiona cotizaciones para tus clientes.</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/quotes/list">
            <FileText className="mr-2 h-4 w-4" />
            Ver todas las cotizaciones
          </Link>
        </Button>
      </div>
      <QuotesClient />
    </div>
  )
}

