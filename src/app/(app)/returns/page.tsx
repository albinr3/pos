import { ReturnsClient } from "./returns-client"

export default function ReturnsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva Devolución</h1>
        <p className="text-sm text-muted-foreground">Registra una devolución de productos de una venta.</p>
      </div>
      <ReturnsClient />
    </div>
  )
}









