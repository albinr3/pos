import { SuppliersClient } from "./suppliers-client"

export default function SuppliersPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
        <p className="text-sm text-muted-foreground">Gestiona tus proveedores y sus datos de contacto.</p>
      </div>
      <SuppliersClient />
    </div>
  )
}














