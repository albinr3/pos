import { PaymentsListClient } from "./payments-list-client"

export default function PaymentsListPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recibos de Pago</h1>
        <p className="text-sm text-muted-foreground">Consulta y cancela recibos de pago registrados.</p>
      </div>
      <PaymentsListClient />
    </div>
  )
}











