/** Resumen estable de los datos fiscales revisados, sin IDs transitorios de la venta. */
export function fiscalSaleReviewSignature(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("La revisión fiscal no es válida")
  const snapshot = value as Record<string, unknown>
  if (!Array.isArray(snapshot.lines) || !snapshot.totals || !snapshot.currency) throw new Error("La revisión fiscal está incompleta")
  // El orden de los IDs generados para los artículos puede diferir del orden de la previsualización.
  const lines = snapshot.lines.map(line => JSON.stringify(line)).sort()
  return JSON.stringify({
    type: snapshot.type ?? null,
    issueDate: snapshot.issueDate ?? null,
    issuer: snapshot.issuer ?? null,
    buyer: snapshot.buyer ?? null,
    incomeType: snapshot.incomeType ?? null,
    payment: snapshot.payment ?? null,
    currency: snapshot.currency,
    lines,
    totals: snapshot.totals,
    reportingTotals: snapshot.reportingTotals ?? null,
  })
}
