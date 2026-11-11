/** Referencia comercial para recibos, sin presentar un cargo de débito como otra venta. */
export function receivableOriginLabel(origin: { sale?: { invoiceCode: string } | null; debitAdjustment?: { id: string } | null }) {
  return origin.sale?.invoiceCode ?? (origin.debitAdjustment ? `ND-${origin.debitAdjustment.id.slice(-8).toUpperCase()}` : "Origen no disponible")
}
