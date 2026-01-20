import { ShippingLabelsClient } from "./shipping-labels-client"

export default function ShippingLabelsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Etiquetas de Envío</h1>
        <p className="text-sm text-muted-foreground">Genera etiquetas para envío de pedidos a clientes.</p>
      </div>
      <ShippingLabelsClient />
    </div>
  )
}















