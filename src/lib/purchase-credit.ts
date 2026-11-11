import { createHash } from "node:crypto"
import { Prisma, type PaymentMethod } from "@prisma/client"
import { type CashActor } from "@/lib/cash-context"
import { hasPermission, type PermissionKey } from "@/lib/permissions"

export type PurchaseActor = CashActor
export class PurchaseError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = "PurchaseError" }
}
export function purchasePermit(actor: PurchaseActor, permission: PermissionKey) {
  if (!hasPermission(actor, permission)) throw new PurchaseError("FORBIDDEN", "No tienes permiso para esta operación", 403)
}
export function moneyCents(value: unknown, allowZero = false): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value > 2147483647 || value < (allowZero ? 0 : 1)) {
    throw new PurchaseError("INVALID_AMOUNT", "Introduce un importe válido en centavos")
  }
  return value
}
export function creditDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 3650) throw new PurchaseError("INVALID_CREDIT_DAYS", "Los días de crédito deben ser un entero entre 0 y 3650")
  return value
}
export function businessDate(now = new Date()) { return new Date(now.getTime() - 4 * 3600000).toISOString().slice(0, 10) }
export function dateOnly(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new PurchaseError("INVALID_DUE_DATE", "Introduce una fecha YYYY-MM-DD válida")
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new PurchaseError("INVALID_DUE_DATE", "Fecha de vencimiento inválida")
  return date
}
export function suggestedDueDate(days: number, now = new Date()) {
  return new Date(dateOnly(businessDate(now)).getTime() + creditDays(days) * 86400000).toISOString().slice(0, 10)
}
export function payableStatus(total: number, balance: number) { return balance === 0 ? "PAGADA" as const : balance === total ? "PENDIENTE" as const : "PARCIAL" as const }
export function overdueDays(dueDate: Date, balance: number, now = new Date()) {
  return balance > 0 ? Math.max(0, Math.floor((dateOnly(businessDate(now)).getTime() - dueDate.getTime()) / 86400000)) : 0
}
export function purchaseType(value: unknown) {
  if (value === undefined || value === null) return "CONTADO" as const
  if (value !== "CONTADO" && value !== "CREDITO") throw new PurchaseError("INVALID_PURCHASE_TYPE", "Tipo de compra inválido")
  return value
}
export async function lockPurchaseAccount(tx: Prisma.TransactionClient, accountId: string) {
  // El candado de negocio se toma ANTES de inventario o saldo para evitar sobrepagos e interbloqueos.
  const accounts = await tx.$queryRaw<{ id: string; deletionRequestedAt: Date | null }[]>`SELECT id, "deletionRequestedAt" FROM "Account" WHERE id = ${accountId} FOR NO KEY UPDATE`
  // Revalidar después de esperar: no admitir compras o pagos tras confirmar la eliminación.
  if (!accounts.length || accounts[0].deletionRequestedAt) throw new PurchaseError("ACCOUNT_DELETING", "Esta cuenta está en proceso de eliminación", 403)
}
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key, v]) => v !== undefined && key !== "cashOperation").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
  return value
}
export async function purchaseOperation<T>(tx: Prisma.TransactionClient, actor: PurchaseActor, kind: string, operationId: unknown, payload: unknown, run: () => Promise<T>): Promise<T> {
  if (typeof operationId !== "string" || !operationId.trim() || operationId.length > 128) throw new PurchaseError("OPERATION_ID_REQUIRED", "Envía un operationId estable de hasta 128 caracteres")
  const payloadHash = createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex")
  const previous = await tx.purchaseOperation.findUnique({ where: { accountId_operationId: { accountId: actor.accountId, operationId } } })
  if (previous) {
    if (previous.kind !== kind || previous.userId !== actor.id || previous.payloadHash !== payloadHash) throw new PurchaseError("OPERATION_CONFLICT", "El identificador corresponde a otra operación", 409)
    return previous.response as T
  }
  const result = await run()
  await tx.purchaseOperation.create({ data: { accountId: actor.accountId, userId: actor.id, kind, operationId, payloadHash, response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue } })
  return result
}
export async function supplierPaymentAccount(tx: Prisma.TransactionClient, actor: PurchaseActor, method: unknown, accountId: unknown) {
  if (typeof method !== "string" || !["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"].includes(method)) throw new PurchaseError("INVALID_PAYMENT_METHOD", "Selecciona un método de pago válido")
  if (typeof accountId !== "string" || !accountId) throw new PurchaseError("PAYMENT_ACCOUNT_REQUIRED", "Selecciona una cuenta de tesorería")
  const account = await tx.treasuryAccount.findFirst({ where: { accountId: actor.accountId, id: accountId, isActive: true } })
  if (!account) throw new PurchaseError("INVALID_PAYMENT_ACCOUNT", "La cuenta de pago no existe o está inactiva")
  if (account.currency !== "DOP" || (method === "EFECTIVO" ? account.type !== "CAJA" : account.type !== "BANCO")) throw new PurchaseError("INVALID_PAYMENT_ACCOUNT", "Usa una caja en efectivo o un banco para pagos digitales en DOP")
  return { account, method: method as PaymentMethod }
}
export type CreditPurchaseInput = {
  type?: "CONTADO" | "CREDITO"
  dueDate?: string
  initialPaymentCents?: number
  operationId?: string
}

export function validatePurchaseMetadata(input: Record<string, unknown>) {
  for (const key of ["supplierId", "supplierName", "notes", "treasuryAccountId", "supplierReceiptNumber"]) {
    if (input[key] !== undefined && input[key] !== null && typeof input[key] !== "string") throw new PurchaseError("INVALID_BODY", `${key} debe ser texto`)
  }
  if (typeof input.supplierReceiptNumber === "string" && input.supplierReceiptNumber.trim().length > 50) throw new PurchaseError("INVALID_BODY", "El comprobante del proveedor admite hasta 50 caracteres")
}

export function validatePurchaseItems(items: unknown): asserts items is Array<{ productId: string; qty: number; unitCostCents: number }> {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new PurchaseError("INVALID_ITEMS", "Incluye entre 1 y 500 productos")
  const ids = new Set<string>()
  for (const item of items) {
    if (!item || typeof item !== "object" || typeof item.productId !== "string" || !item.productId || ids.has(item.productId)) throw new PurchaseError("INVALID_ITEMS", "Cada producto debe tener un identificador único en la compra")
    ids.add(item.productId)
    if (typeof item.qty !== "number" || !Number.isFinite(item.qty) || item.qty <= 0 || item.qty > 9999999.999 || Math.abs(item.qty * 1000 - Math.round(item.qty * 1000)) > 0.00001) throw new PurchaseError("INVALID_ITEMS", "La cantidad debe ser positiva y tener hasta tres decimales")
    moneyCents(item.unitCostCents, true)
    for (const key of ["discountPercentBp", "salePriceCents", "saleMarginBp"]) {
      const value = item[key]
      if (value !== undefined && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) throw new PurchaseError("INVALID_ITEMS", "Los precios, descuentos y márgenes deben ser enteros no negativos")
      const maximum = key === "discountPercentBp" ? 10000 : key === "saleMarginBp" ? 50000 : 2147483647
      if (value !== undefined && value > maximum) throw new PurchaseError("INVALID_ITEMS", "Precio, descuento o margen fuera de rango")
    }
  }
}
