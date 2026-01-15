import { ProductsClient } from "./products-client"

export default function ProductsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <p className="text-sm text-muted-foreground">Crea y administra tus productos e inventario.</p>
      </div>
      <ProductsClient />
    </div>
  )
}
