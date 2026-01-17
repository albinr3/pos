import { SalesListClient } from "./sales-list-client"

export default function SalesListPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facturas de Ventas</h1>
        <p className="text-sm text-muted-foreground">Consulta, edita y elimina facturas de ventas registradas.</p>
      </div>
      <SalesListClient />
    </div>
  )
}














