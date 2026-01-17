import { OperatingExpensesClient } from "./operating-expenses-client"

export default function OperatingExpensesPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gastos Operativos</h1>
        <p className="text-sm text-muted-foreground">Registra y consulta los gastos operativos de la empresa.</p>
      </div>
      <OperatingExpensesClient />
    </div>
  )
}














