export const purchaseSummaryLabels: Record<string, string> = {
  count: "Registros", activeCount: "Activos", cancelledCount: "Anulados", totalCents: "Total original activo", cashCents: "Compras al contado", creditCents: "Compras a crédito", paidCents: "Abonado actual", balanceCents: "Pendiente actual", overdueCents: "Vencido actual", cancelledCents: "Importe anulado", amountCents: "Pagos activos",
}

export function purchaseFilterDescription(filters: Record<string, unknown>) {
  const parts = [filters.from && `Desde: ${filters.from}`, filters.to && `Hasta: ${filters.to}`, filters.query && `Buscar: ${filters.query}`, filters.supplierName && `Proveedor: ${filters.supplierName}`, filters.treasuryAccountName && `Cuenta: ${filters.treasuryAccountName}`, filters.type && `Condición: ${filters.type}`, filters.status && `Estado: ${filters.status}`, filters.method && `Método: ${filters.method}`, filters.overdue === "true" && "Solo vencidas", filters.cancelled && `Anulación: ${filters.cancelled === "true" ? "anulados" : filters.cancelled === "all" ? "todos" : "activos"}`].filter(Boolean)
  return parts.length ? parts.join(" · ") : "Todos los registros activos"
}
