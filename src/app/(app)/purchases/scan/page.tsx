import { ScanInvoiceClient } from "./scan-invoice-client"

export default function ScanInvoicePage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Escanear Factura de Compra</h1>
        <p className="text-sm text-muted-foreground">
          Captura o sube una imagen de la factura del proveedor para extraer los datos automáticamente.
        </p>
      </div>
      <ScanInvoiceClient />
    </div>
  )
}















