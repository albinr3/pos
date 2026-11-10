import type { Prisma } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { prisma } from "@/lib/db"
import { calcDiscountedDocumentTotalsByTaxMode, calcPercentAmountCents, normalizeDiscountPercentBp } from "@/lib/money"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { calculateFiscalDocument, FiscalDocumentError } from "./document"
import { parseFiscalSaleCommand } from "./sale-command"
import { requireFiscalSaleAccess } from "./sale-customer"
import { calculateExemptSalePrices } from "./sale-pricing"
import { buildFiscalSaleFromSource } from "./sale-document"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Tx = Prisma.TransactionClient
function invalid(field: string, message: string): never { throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "Revisa los datos de la venta", 422, [{ field, message }]) }
function obj(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(field, "Se esperaba un objeto")
  return value as Record<string, unknown>
}

/** Previsualiza sin crear una venta, reservar números ni aceptar importes fiscales del cliente. */
export async function previewFiscalSale(actor: Actor, raw: unknown, db: Tx = prisma) {
  await requireFiscalSaleAccess(actor, db)
  const body = obj(raw, "body")
  let command = parseFiscalSaleCommand(body.fiscal)
  const settings = await db.fiscalSettings.findUnique({ where: { accountId: actor.accountId } })
  if (!settings || settings.version !== command.expectedPolicyVersion) throw new FiscalDocumentError("VERSION_CONFLICT", "La política fiscal cambió; vuelve a cargarla", 409)
  const company = await db.companySettings.findFirst({ where: { accountId: actor.accountId }, select: { salePricesIncludeItbis: true, legalTipEnabled: true } })
  const customerId = typeof body.customerId === "string" && body.customerId !== "generic" ? body.customerId : null
  let customer = await db.customer.findFirst({ where: customerId ? { id: customerId, accountId: actor.accountId, isActive: true } : { accountId: actor.accountId, isGeneric: true, isActive: true } })
  if (!customer) return invalid("customerId", customerId ? "El cliente no existe o está inactivo" : "No se encontró el cliente general")
  if (customer.isGeneric && command.buyer) {
    const { resolveFiscalBuyerCustomer } = await import("./sale-customer")
    const matchedId = await resolveFiscalBuyerCustomer(actor, true, command.buyer, db)
    if (matchedId) {
      const matched = await db.customer.findFirst({ where: { id: matchedId, accountId: actor.accountId, isActive: true } })
      if (!matched || matched.isGeneric) return invalid("customerId", "El cliente con esa identificación ya no está disponible")
      customer = matched
      command = { ...command, buyer: undefined }
    }
  }
  const type: "CONTADO" | "CREDITO" = body.type === "CREDITO" ? "CREDITO" : body.type === "CONTADO" ? "CONTADO" : invalid("type", "Selecciona contado o crédito")
  if (type === "CREDITO" && customer.isGeneric) return invalid("customerId", "Para crédito debes seleccionar un cliente")
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) return invalid("items", "Indica entre uno y cien productos")
  const rawItems = body.items.map((rawItem, index) => {
    const item = obj(rawItem, `items.${index}`)
    const productId = typeof item.productId === "string" ? item.productId : ""
    const qty = Number(item.qty ?? item.quantity)
    const unitPriceCents = Number(item.unitPriceCents)
    if (!productId || !Number.isFinite(qty) || qty <= 0 || Math.abs(qty * 100 - Math.round(qty * 100)) > 1e-8 || !Number.isSafeInteger(unitPriceCents) || unitPriceCents <= 0) return invalid(`items.${index}`, "Producto, cantidad o precio inválido")
    return { productId, qty, unitPriceCents }
  })
  const products = await db.product.findMany({ where: { accountId: actor.accountId, id: { in: [...new Set(rawItems.map(item => item.productId))] }, isActive: true, isAvailableForSale: true }, select: { id: true, accountId: true, name: true, priceCents: true, itbisRateBp: true, fiscalItemType: true, fiscalUnit: true, fiscalTaxTreatment: true } })
  const productsById = new Map(products.map(product => [product.id, product]))
  const items = rawItems.map((item, index) => {
    const product = productsById.get(item.productId)
    if (!product) return invalid(`items.${index}.productId`, "Producto no disponible en esta empresa")
    if (item.unitPriceCents !== product.priceCents && !hasPermission(actor, "canOverridePrice")) return invalid(`items.${index}.unitPriceCents`, "No tienes permiso para cambiar el precio")
    return { id: `preview-${String(index).padStart(3, "0")}`, productId: item.productId, qty: item.qty, unitPriceCents: item.unitPriceCents, itbisRateBp: product.itbisRateBp, product }
  })
  const priceIncludes = typeof body.salePricesIncludeItbis === "boolean" ? body.salePricesIncludeItbis : company?.salePricesIncludeItbis ?? true
  const manual = body.discountMode === "MANUAL"
  if (manual && !hasPermission(actor, "canApplyDiscounts")) return invalid("discountMode", "No tienes permiso para aplicar descuentos")
  const discount = normalizeDiscountPercentBp(manual ? Number(body.manualDiscountPercentBp ?? 0) : customer.saleDiscountPercentBp)
  const shipping = body.shippingCents === undefined ? 0 : Number(body.shippingCents)
  if (!Number.isSafeInteger(shipping) || shipping < 0) return invalid("shippingCents", "Importe de envío inválido")
  const ordinary = calcDiscountedDocumentTotalsByTaxMode(items.map(item => ({ unitPriceCents: item.unitPriceCents, qty: item.qty, itbisRateBp: item.itbisRateBp })), priceIncludes, discount)
  const exempt = ["E44", "E46"].includes(command.type)
  const subtotal = exempt ? calculateExemptSalePrices({ lines: items, priceIncludesItbis: priceIncludes, discountPercentBp: discount, shippingCents: shipping, applyLegalTip: false }).subtotalCents : ordinary.subtotalCents
  const tip = (company?.legalTipEnabled && (typeof body.applyLegalTip === "boolean" ? body.applyLegalTip : true)) ? calcPercentAmountCents(subtotal, 1000) : 0
  const total = (exempt ? subtotal : ordinary.itemsTotalCents) + shipping + tip
  if (!Number.isSafeInteger(total) || total > 2147483647) return invalid("items", "El total supera el límite admitido")
  const soldAt = body.soldAt === undefined ? new Date() : new Date(body.soldAt as string | number)
  if (!Number.isFinite(soldAt.getTime())) return invalid("soldAt", "Fecha de venta inválida")
  let dueDate: Date | null = null
  if (type === "CREDITO") {
    if (command.dueDate) dueDate = new Date(`${command.dueDate}T12:00:00.000Z`)
    else if (customer.creditDays > 0) { dueDate = new Date(soldAt); dueDate.setDate(dueDate.getDate() + customer.creditDays) }
  }
  const method = typeof body.paymentMethod === "string" ? body.paymentMethod : null
  const rawPayments = Array.isArray(body.paymentSplits) ? body.paymentSplits : []
  const payments = rawPayments.map((rawPayment, index) => {
    const item = obj(rawPayment, `paymentSplits.${index}`)
    return { method: String(item.method ?? ""), amountCents: Number(item.amountCents), treasuryAccountId: typeof item.treasuryAccountId === "string" ? item.treasuryAccountId : null, transferBankName: typeof item.transferBankName === "string" ? item.transferBankName : null }
  })
  const sale: Parameters<typeof buildFiscalSaleFromSource>[2] = { id: "PREVIEW", invoiceCode: "PREVIEW", soldAt, type, cancelledAt: null, totalCents: total, shippingCents: shipping, legalTipCents: tip, discountPercentBp: discount, salePricesIncludeItbis: priceIncludes, paymentMethod: method, treasuryAccountId: typeof body.treasuryAccountId === "string" ? body.treasuryAccountId : null, transferBankName: typeof body.transferBankName === "string" ? body.transferBankName : null, customer, ar: type === "CREDITO" ? { dueDate } : null, payments, items }
  const built = await buildFiscalSaleFromSource(db, actor, sale, settings, command)
  const snapshot = calculateFiscalDocument(built.document, settings.version)
  if (!new Decimal(snapshot.totals.gross).mul(100).eq(total)) return invalid("items", "Los importes fiscales no concilian con la venta")
  return { ...snapshot, sale: { ...built.metadata, customerId: customer.id }, notice: "Previsualización local / No emitido fiscalmente", informational: true }
}
