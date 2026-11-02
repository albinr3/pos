// Funciones puras compartidas por el registro financiero y sus pruebas.
export type CashLeg = { treasuryAccountId: string; method: string | null; amountCents: number }
export type MoneyDocument = {
  cancelledAt?: Date | null; type?: string; paymentMethod?: string | null; method?: string | null;
  treasuryAccountId?: string | null; refundMethod?: string | null; refundTreasuryAccountId?: string | null;
  fromTreasuryAccountId?: string; toTreasuryAccountId?: string; totalCents?: number; amountCents?: number;
  payments?: Array<{ treasuryAccountId?: string | null; method: string; amountCents: number }>;
  sale?: { type: string };
}
export type CashJson = null | string | number | boolean | CashJson[] | { [key: string]: CashJson }
export type CashClosingSnapshot = {
  emergency: boolean;
  movements: Array<{ id: string; reference: string; sourceType?: string; method: string | null; amountCents: number; treasuryAccount?: { name: string } }>;
  documents: Array<{ id: string; sourceType: string; reference: string; totalCents: number; type: string | null; cancelled: boolean }>;
}
export type ShiftCollection = { method: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO"; totalCents: number }

export function shiftCollectionsByMethod(movements: ReadonlyArray<{ sourceType?: string; method: string | null; amountCents: number }>): ShiftCollection[] | null {
  // Una instantánea antigua sin origen no permite distinguir cobros de gastos: no inventar ceros.
  if (movements.some(m => !m.sourceType)) return null
  const totals: Record<ShiftCollection["method"], number> = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, OTRO: 0 }
  for (const movement of movements) {
    // Cobrado no es saldo de caja ni flujo neto: solo ventas y abonos, con sus reversos.
    // El fondo, traspasos, gastos y devoluciones conservan su propio movimiento por separado.
    if (movement.sourceType !== "sale" && movement.sourceType !== "payment") continue
    const method = movement.method === "EFECTIVO" || movement.method === "TARJETA" || movement.method === "TRANSFERENCIA" ? movement.method : "OTRO"
    totals[method] += movement.amountCents
  }
  return (Object.keys(totals) as ShiftCollection["method"][])
    .filter(method => method !== "OTRO" || totals[method] !== 0)
    .map(method => ({ method, totalCents: totals[method] }))
}

export function snapshotBreakdown(movements: CashClosingSnapshot["movements"]) {
  const totals = new Map<string, { method: string | null; accountName: string; totalCents: number }>()
  for (const m of movements) {
    if (["OPENING_DIFFERENCE", "CLOSING_DIFFERENCE", "BASELINE"].includes(m.sourceType ?? "")) continue
    const accountName = m.treasuryAccount?.name ?? "Cuenta"
    const key = `${accountName}:${m.method ?? ""}`
    const previous = totals.get(key)
    totals.set(key, { accountName, method: m.method, totalCents: (previous?.totalCents ?? 0) + m.amountCents })
  }
  return [...totals.values()]
}
export function snapshotSalesSummary(documents: CashClosingSnapshot["documents"]) {
  return documents.reduce((totals, doc) => {
    if (doc.cancelled) return totals
    if (doc.sourceType === "sale" && doc.type === "CONTADO") totals.cashSalesCents += doc.totalCents
    if (doc.sourceType === "sale" && doc.type === "CREDITO") totals.creditSalesCents += doc.totalCents
    if (doc.sourceType === "payment") totals.collectionsCents += doc.totalCents
    return totals
  }, { cashSalesCents: 0, creditSalesCents: 0, collectionsCents: 0 })
}
export function cents(value: unknown, allowNegative = false): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Math.abs(value) > 2147483647 || (!allowNegative && value < 0)) {
    throw new Error("Introduce un monto válido en centavos")
  }
  return value
}
export function difference(expected: number, counted: number, note?: string | null) {
  cents(counted)
  const result = cents(counted - expected, true)
  if (result && !note?.trim()) throw new Error("Debes explicar el sobrante o faltante")
  return result
}
export function documentLegs(model: string, row: MoneyDocument | undefined | null): CashLeg[] {
  if (!row || row.cancelledAt) return []
  const leg = (treasuryAccountId: string | null | undefined, method: string | null | undefined, amountCents: number | undefined): CashLeg[] =>
    treasuryAccountId && amountCents ? [{ treasuryAccountId, method: method ?? null, amountCents: cents(amountCents, true) }] : []
  switch (model) {
    case "sale":
      if (row.type !== "CONTADO") return []
      return row.payments?.length
        ? row.payments.flatMap(p => leg(p.treasuryAccountId, p.method, p.amountCents))
        : leg(row.treasuryAccountId, row.paymentMethod, row.totalCents)
    case "payment": return leg(row.treasuryAccountId, row.method, row.amountCents)
    // El crédito no mueve dinero: cada abono se registra una sola vez como supplierPayment.
    case "purchase": return row.type === "CREDITO" ? [] : leg(row.treasuryAccountId, row.paymentMethod, -cents(row.totalCents))
    case "supplierPayment": return leg(row.treasuryAccountId, row.method, -cents(row.amountCents))
    case "operatingExpense": return leg(row.treasuryAccountId, row.paymentMethod, -cents(row.amountCents))
    case "return": return row.sale?.type === "CONTADO" ? leg(row.refundTreasuryAccountId, row.refundMethod, -cents(row.totalCents)) : []
    // REVERSED conserva el asiento original: el reverso es otra transferencia.
    case "treasuryTransfer": return [...leg(row.fromTreasuryAccountId, null, -cents(row.amountCents)), ...leg(row.toTreasuryAccountId, null, row.amountCents)]
    case "treasuryOpeningBalance": return leg(row.treasuryAccountId, null, row.amountCents)
    default: return []
  }
}
export function legDelta(before: CashLeg[], after: CashLeg[]): CashLeg[] {
  const totals = new Map<string, CashLeg>()
  for (const [rows, sign] of [[before, -1], [after, 1]] as const) for (const row of rows) {
    const key = `${row.treasuryAccountId}:${row.method ?? ""}`
    const previous = totals.get(key)
    totals.set(key, { ...row, amountCents: cents((previous?.amountCents ?? 0) + row.amountCents * sign, true) })
  }
  return [...totals.values()].filter(row => row.amountCents !== 0)
}
export function encodeCashResult(value: unknown): CashJson {
  if (value instanceof Date) return { __cashDate: value.toISOString() }
  if (Array.isArray(value)) return value.map(encodeCashResult)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeCashResult(v)]))
  if (value === undefined || value === null) return null
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value
  throw new Error("La respuesta financiera no se puede serializar")
}
export function decodeCashResult(value: CashJson): unknown {
  if (value && !Array.isArray(value) && typeof value === "object" && typeof value.__cashDate === "string") return new Date(value.__cashDate)
  if (Array.isArray(value)) return value.map(decodeCashResult)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeCashResult(v)]))
  return value
}
