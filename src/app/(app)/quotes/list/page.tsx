import { QuotesListClient } from "./quotes-list-client"

export default function QuotesListPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lista de Cotizaciones</h1>
        <p className="text-sm text-muted-foreground">Consulta y gestiona todas las cotizaciones creadas.</p>
      </div>
      <QuotesListClient />
    </div>
  )
}










