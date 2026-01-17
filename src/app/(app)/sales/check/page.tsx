import { CheckSaleClient } from "./check-client"

export default function CheckSalePage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verificar Factura</h1>
        <p className="text-sm text-muted-foreground">Busca una factura por su código para verificar si existe en la base de datos.</p>
      </div>
      <CheckSaleClient />
    </div>
  )
}














