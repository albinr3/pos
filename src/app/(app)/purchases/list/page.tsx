import { PurchasesListClient } from "./purchases-list-client"

export default function PurchasesListPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
        <p className="text-sm text-muted-foreground">Consulta, edita y elimina compras registradas.</p>
      </div>
      <PurchasesListClient />
    </div>
  )
}














