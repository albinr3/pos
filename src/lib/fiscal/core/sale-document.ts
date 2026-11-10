import type { Prisma } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { calcDiscountedLineTotalsByTaxMode } from "@/lib/money"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { FiscalDocumentError } from "./document"
import { findSaleCustomerByIdentification } from "./sale-customer"
import type { FiscalSaleCommand, FiscalSaleBuyer } from "./sale-command"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Tx = Prisma.TransactionClient
type FiscalSaleSource = {
  id: string; invoiceCode: string; soldAt: Date; type: "CONTADO" | "CREDITO"; cancelledAt: Date | null
  totalCents: number; shippingCents: number; legalTipCents: number; discountPercentBp: number; salePricesIncludeItbis: boolean
  paymentMethod: string | null; treasuryAccountId: string | null; transferBankName: string | null
  customer: { id: string; name: string; isGeneric: boolean; fiscalIdentification: string | null; fiscalIdentificationCountry: string | null; fiscalLegalName: string | null; cedula: string | null } | null
  ar: { dueDate: Date | null } | null
  payments: Array<{ method: string; amountCents: number; treasuryAccountId: string | null; transferBankName: string | null }>
  items: Array<{ id: string; productId: string; qty: Prisma.Decimal | number; unitPriceCents: number; itbisRateBp: number; product: { id: string; accountId: string; name: string; fiscalItemType: string | null; fiscalUnit: string | null; fiscalTaxTreatment: string | null } }>
}
type FiscalIssuer = { version: number; legalName: string | null; taxId: string | null }
const cents = (value: number) => new Decimal(value).div(100).toFixed(2)
const day = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value)
function invalid(field: string, message: string): never { throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "Revisa los datos de la venta fiscal", 422, [{ field, message }]) }
function buyerIdentity(value: string | null | undefined, country: string | null | undefined) {
  if (!value?.trim()) return null
  const code = country?.trim().toUpperCase() || "DO"
  const identification = code === "DO" ? value.replace(/[\s-]/g, "") : value.trim()
  if (code === "DO" && !/^(?:\d{9}|\d{11})$/.test(identification)) return null
  return { identification, country: code }
}

/** Genera la entrada fiscal exclusivamente a partir de la venta persistida dentro de su transacción. */
export async function buildFiscalSaleDocument(tx: Tx, actor: Actor, saleId: string, command: FiscalSaleCommand) {
  if (!hasPermission(actor, "canAccessSales") || !hasPermission(actor, "canPrepareFiscalDocuments")) throw new FiscalDocumentError("FORBIDDEN", "Sin permiso para preparar ventas fiscales", 403)
  const settings = await tx.fiscalSettings.findUnique({ where: { accountId: actor.accountId } })
  if (!settings?.enabled || settings.jurisdiction !== "DO" || settings.regime !== "DO_ECF" || settings.environment !== "TEST" || settings.configurationStatus !== "VALIDATED") throw new FiscalDocumentError("PROFILE_UNAVAILABLE", "Activa una configuración fiscal válida de prueba", 409)
  if (settings.version !== command.expectedPolicyVersion) throw new FiscalDocumentError("VERSION_CONFLICT", "La política fiscal cambió; vuelve a cargarla", 409, [{ field: "fiscal.expectedPolicyVersion", message: "Versión desactualizada" }])
  if (!settings.legalName || !settings.taxId) return invalid("issuer", "Completa la razón social y RNC del emisor")
  const sale = await tx.sale.findFirst({ where: { id: saleId, accountId: actor.accountId }, include: {
    customer: true, ar: true, payments: { orderBy: { id: "asc" } },
    items: { orderBy: { id: "asc" }, include: { product: { select: { id: true, accountId: true, name: true, fiscalItemType: true, fiscalUnit: true, fiscalTaxTreatment: true } } } },
  } })
  if (!sale) throw new FiscalDocumentError("DOCUMENT_CONFLICT", "La venta no existe o está anulada", 409)
  return buildFiscalSaleFromSource(tx, actor, sale, settings, command)
}

export async function buildFiscalSaleFromSource(tx: Tx, actor: Actor, sale: FiscalSaleSource, settings: FiscalIssuer, command: FiscalSaleCommand) {
  if (sale.cancelledAt) throw new FiscalDocumentError("DOCUMENT_CONFLICT", "La venta no existe o está anulada", 409)
  if (!settings.legalName || !settings.taxId) return invalid("issuer", "Completa la razón social y RNC del emisor")
  if (!sale.items.length || sale.items.some(item => item.product.accountId !== actor.accountId)) return invalid("lines", "La venta no contiene productos válidos de la empresa")
  if (sale.items.length + Number(sale.shippingCents > 0) + Number(sale.legalTipCents > 0) > 100) return invalid("lines", "El documento fiscal admite hasta cien conceptos, incluido envío y propina")
  const generic = !sale.customer || sale.customer.isGeneric
  const storedIdentification = !generic ? buyerIdentity(sale.customer?.fiscalIdentification || sale.customer?.cedula, sale.customer?.fiscalIdentification ? sale.customer.fiscalIdentificationCountry : "DO") : null
  let buyer: (FiscalSaleBuyer & { id?: string }) | undefined
  if (command.buyer) {
    if (!generic && storedIdentification && (storedIdentification.identification !== command.buyer.identification || storedIdentification.country !== command.buyer.country)) return invalid("fiscal.buyer.identification", "La identificación no coincide con el cliente seleccionado")
    if (generic && command.buyer.country === "DO") {
      const found = await findSaleCustomerByIdentification(actor, command.buyer.identification, tx)
      // No sustituir un cliente o descuento después de cobrar: exigir selección y revisión explícita.
      if (found.matches.length || found.hasMore) return invalid("fiscal.buyer.identification", "Esta identificación pertenece a un cliente registrado; selecciónalo antes de confirmar")
    }
    buyer = { ...command.buyer, ...(!generic && sale.customer ? { id: sale.customer.id } : {}) }
  } else if (!generic && sale.customer && storedIdentification) {
    buyer = { id: sale.customer.id, name: sale.customer.fiscalLegalName?.trim() || sale.customer.name, ...storedIdentification }
  }
  if (command.type === "E46") {
    const mode = command.special?.exportMode
    if (mode === "ZONA_FRANCA_COMERCIAL_RESIDENTE" && buyer?.country !== "DO") return invalid("fiscal.buyer", "La transferencia a residentes requiere RNC o cédula dominicana")
    if (mode === "ZONA_FRANCA_COMERCIAL_NO_RESIDENTE" && (!buyer || buyer.country === "DO")) return invalid("fiscal.buyer", "La transferencia a no residentes requiere identificación extranjera")
  }
  const exempt = command.type === "E44" || command.type === "E46"
  const treatmentForRate = (rate: number, configured: string | null, field: string) => {
    if (![0, 1600, 1800].includes(rate)) return invalid(field, "La tasa del producto no está soportada por el perfil fiscal")
    if (configured === "NO_FACTURABLE") return invalid(field, "El producto no es facturable")
    if (rate > 0 && configured && configured !== "GRAVADO") return invalid(field, "La clasificación fiscal no coincide con el ITBIS del producto")
    if (rate === 0 && configured !== "EXENTO" && configured !== "TASA_CERO") return invalid(field, "Indica si el producto sin ITBIS es exento o de tasa cero")
    if (exempt) return command.type === "E44" ? "EXENTO" : "TASA_CERO"
    return rate === 1800 ? "GRAVADO_18" : rate === 1600 ? "GRAVADO_16" : configured!
  }
  const commercialLines: Array<Record<string, unknown>> = []
  const lines = sale.items.map((item, index) => {
    const field = `lines.${index}`
    const qty = Number(item.qty)
    if (!Number.isFinite(qty) || qty <= 0 || Math.abs(qty * 100 - Math.round(qty * 100)) > 1e-8) return invalid(field, "La cantidad admite hasta dos decimales")
    const kind = item.product.fiscalItemType
    if (kind !== "BIEN" && kind !== "SERVICIO") return invalid(`${field}.kind`, `Configura si ${item.product.name} es bien o servicio`)
    if (command.type === "E46" && kind !== "BIEN") return invalid(`${field}.kind`, "E46 solo admite bienes exportados")
    const unit = item.product.fiscalUnit?.trim()
    if (!unit) return invalid(`${field}.unit`, `Configura la unidad fiscal de ${item.product.name}`)
    const treatment = treatmentForRate(item.itbisRateBp, item.product.fiscalTaxTreatment, `${field}.taxTreatment`)
    const original = calcDiscountedLineTotalsByTaxMode(item.unitPriceCents, qty, item.itbisRateBp, sale.salePricesIncludeItbis, sale.discountPercentBp)
    commercialLines.push({ saleItemId: item.id, productId: item.productId, quantity: String(qty), unitPriceCents: item.unitPriceCents, itbisRateBp: item.itbisRateBp, priceIncludesTax: sale.salePricesIncludeItbis, originalBaseCents: original.subtotalCents, originalTaxCents: original.itbisCents, originalTotalCents: original.totalCents })
    let unitPrice = new Decimal(item.unitPriceCents).div(100)
    if (exempt) {
      unitPrice = new Decimal(original.subtotalBeforeDiscountCents).div(100).div(qty).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
    }
    // Calcular el ajuste desde la línea comercial evita diferencias de un centavo por redondeo binario.
    const rawCents = unitPrice.mul(qty).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    const targetCents = exempt || !sale.salePricesIncludeItbis ? original.subtotalCents : original.totalCents
    const delta = rawCents - targetCents
    const discountCents = Math.max(0, delta), surchargeCents = Math.max(0, -delta)
    return { productId: item.productId, description: item.product.name, kind, unit, quantity: new Decimal(qty).toFixed(2), unitPrice: unitPrice.toFixed(4), taxTreatment: treatment, priceIncludesTax: exempt ? false : sale.salePricesIncludeItbis, discount: cents(discountCents), ...(surchargeCents ? { surcharge: cents(surchargeCents) } : {}) }
  })
  const ancillaryTreatment = command.type === "E46" ? "TASA_CERO" : command.type === "E44" ? "EXENTO" : command.shippingTaxTreatment
  if (sale.shippingCents > 0 && !ancillaryTreatment) return invalid("fiscal.shippingTaxTreatment", "Indica la clasificación fiscal del envío")
  if (sale.shippingCents > 0) lines.push({ productId: undefined as never, description: "Envío", kind: "ENVIO" as never, unit: "UNIDAD", quantity: "1.00", unitPrice: cents(sale.shippingCents), taxTreatment: ancillaryTreatment!, priceIncludesTax: false, discount: "0.00" })
  if (sale.legalTipCents > 0) lines.push({ productId: undefined as never, description: "Propina legal", kind: "PROPINA" as never, unit: "UNIDAD", quantity: "1.00", unitPrice: cents(sale.legalTipCents), taxTreatment: command.type === "E46" ? "TASA_CERO" : "EXENTO", priceIncludesTax: false, discount: "0.00" })
  const issueDate = day(sale.soldAt)
  const dueDate = sale.ar?.dueDate ? day(sale.ar.dueDate) : undefined
  if (sale.type === "CREDITO" && !dueDate) return invalid("fiscal.dueDate", "Indica el vencimiento de la venta a crédito")
  if (sale.type !== "CREDITO" && command.dueDate) return invalid("fiscal.dueDate", "La fecha de vencimiento solo aplica a crédito")
  const methods: Record<string, string> = { EFECTIVO: "1", TRANSFERENCIA: "2", TARJETA: "3", OTRO: "8" }
  const payments = sale.type === "CREDITO" ? [{ code: "4", amountCents: sale.totalCents }] : sale.payments.length ? sale.payments.map(payment => ({ code: methods[payment.method], amountCents: payment.amountCents, method: payment.method, treasuryAccountId: payment.treasuryAccountId, transferBankName: payment.transferBankName })) : [{ code: sale.paymentMethod ? methods[sale.paymentMethod] : undefined, amountCents: sale.totalCents, method: sale.paymentMethod, treasuryAccountId: sale.treasuryAccountId, transferBankName: sale.transferBankName }]
  if (payments.some(payment => !payment.code) || payments.reduce((sum, payment) => sum + payment.amountCents, 0) !== sale.totalCents) return invalid("payment", "Los medios de pago no concilian con la venta")
  if (!/^[\d\s-]+$/.test(settings.taxId)) return invalid("issuer.identification", "El RNC del emisor no es válido")
  const document = { type: command.type, issueDate, expectedPolicyVersion: settings.version, issuer: { id: actor.accountId, name: settings.legalName, identification: settings.taxId.replace(/[\s-]/g, ""), country: "DO" }, ...(buyer ? { buyer } : {}), source: { kind: "SALE", id: sale.id }, incomeType: command.incomeType, payment: { type: sale.type, ...(dueDate ? { dueDate } : {}) }, currency: { operation: "DOP", reporting: "DOP" }, lines }
  return { document, metadata: { special: command.special ?? null, payments, commercialLines, invoiceCode: sale.invoiceCode, legalTipCents: sale.legalTipCents, shippingCents: sale.shippingCents } }
}
