import { FiscalDocumentError } from "./document"
import { FISCAL_COUNTRIES } from "./countries"

export const FISCAL_SALE_TYPES = ["E31", "E32", "E44", "E45", "E46"] as const
export type FiscalSaleType = (typeof FISCAL_SALE_TYPES)[number]
export type FiscalSaleBuyer = { name: string; identification: string; country: string }
export type FiscalSaleCommand = {
  type: FiscalSaleType
  expectedPolicyVersion: number
  expectedTotalCents?: number
  incomeType: string
  buyer?: FiscalSaleBuyer
  dueDate?: string
  shippingTaxTreatment?: "EXENTO" | "TASA_CERO"
  special?: {
    regime?: string
    exemptionReference?: string
    governmentEntity?: boolean
    purchaseOrder?: string
    purchaseOrderDate?: string
    exportMode?: "EXPORTACION" | "ZONA_FRANCA" | "ZONA_FRANCA_COMERCIAL_RESIDENTE" | "ZONA_FRANCA_COMERCIAL_NO_RESIDENTE"
    destinationCountry?: string
    shipmentNumber?: string
    containerNumber?: string
    departurePort?: string
    deliveryTerms?: string
  }
}

function invalid(field: string, message: string): never {
  throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "Revisa los datos de la venta fiscal", 422, [{ field, message }])
}
function record(value: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(field, "Se esperaba un objeto")
  const result = value as Record<string, unknown>
  const extra = Object.keys(result).find(key => !keys.includes(key))
  if (extra) return invalid(`${field}.${extra}`, "Campo no admitido")
  return result
}
function text(value: unknown, field: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) return invalid(field, "Campo obligatorio")
    return undefined
  }
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f]/.test(value)) return invalid(field, "Dato inválido")
  return value.trim()
}
function calendarDate(value: unknown, field: string): string | undefined {
  const result = text(value, field, 10)
  if (!result) return undefined
  const parsed = new Date(`${result}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) return invalid(field, "Usa una fecha válida AAAA-MM-DD")
  return result
}
function country(value: unknown, field: string, required = false): string | undefined {
  const code = text(value, field, 2, required)?.toUpperCase()
  if (code && !FISCAL_COUNTRIES.some(entry => entry.code === code)) return invalid(field, "Selecciona un país admitido")
  return code
}

/** Acepta únicamente intención y datos declarativos; los importes y números proceden del servidor. */
export function parseFiscalSaleCommand(value: unknown): FiscalSaleCommand {
  const body = record(value, "fiscal", ["type", "expectedPolicyVersion", "expectedTotalCents", "incomeType", "buyer", "dueDate", "shippingTaxTreatment", "special", "currency"])
  const type = text(body.type, "fiscal.type", 3, true) as FiscalSaleType
  if (!FISCAL_SALE_TYPES.includes(type)) return invalid("fiscal.type", "Selecciona un tipo de venta admitido")
  if (!Number.isSafeInteger(body.expectedPolicyVersion) || (body.expectedPolicyVersion as number) < 1) return invalid("fiscal.expectedPolicyVersion", "Indica la versión de configuración vigente")
  if (body.expectedTotalCents !== undefined && (!Number.isSafeInteger(body.expectedTotalCents) || (body.expectedTotalCents as number) < 0)) return invalid("fiscal.expectedTotalCents", "El total revisado es inválido")
  if (body.currency !== undefined && body.currency !== "DOP") return invalid("fiscal.currency", "Por ahora solo se admiten ventas en DOP")
  const incomeType = text(body.incomeType, "fiscal.incomeType", 2) ?? "01"
  if (!["01", "02", "03", "04", "05", "06"].includes(incomeType)) return invalid("fiscal.incomeType", "Tipo de ingreso no admitido")
  let buyer: FiscalSaleBuyer | undefined
  if (body.buyer !== undefined) {
    const entry = record(body.buyer, "fiscal.buyer", ["name", "identification", "country"])
    const buyerCountry = country(entry.country, "fiscal.buyer.country", true)!
    const identification = text(entry.identification, "fiscal.buyer.identification", 20, true)!
    // Solo se eliminan separadores de documentos dominicanos; nunca letras de otra identidad.
    if (buyerCountry === "DO" && (!/^[\d\s-]+$/.test(identification) || !/^(?:\d{9}|\d{11})$/.test(identification.replace(/[\s-]/g, "")))) return invalid("fiscal.buyer.identification", "Indica un RNC o cédula de 9 u 11 dígitos")
    buyer = { name: text(entry.name, "fiscal.buyer.name", 150, true)!, identification: buyerCountry === "DO" ? identification.replace(/[\s-]/g, "") : identification, country: buyerCountry }
  }
  const dueDate = calendarDate(body.dueDate, "fiscal.dueDate")
  const shippingTaxTreatment = text(body.shippingTaxTreatment, "fiscal.shippingTaxTreatment", 20)
  if (shippingTaxTreatment && !["EXENTO", "TASA_CERO"].includes(shippingTaxTreatment)) return invalid("fiscal.shippingTaxTreatment", "El envío solo admite los tratamientos sin ITBIS soportados")
  let special: FiscalSaleCommand["special"]
  if (body.special !== undefined) {
    const entry = record(body.special, "fiscal.special", ["regime", "exemptionReference", "governmentEntity", "purchaseOrder", "purchaseOrderDate", "exportMode", "destinationCountry", "shipmentNumber", "containerNumber", "departurePort", "deliveryTerms"])
    const mode = text(entry.exportMode, "fiscal.special.exportMode", 50)
    if (mode && !["EXPORTACION", "ZONA_FRANCA", "ZONA_FRANCA_COMERCIAL_RESIDENTE", "ZONA_FRANCA_COMERCIAL_NO_RESIDENTE"].includes(mode)) return invalid("fiscal.special.exportMode", "Modalidad de exportación no admitida")
    if (entry.governmentEntity !== undefined && typeof entry.governmentEntity !== "boolean") return invalid("fiscal.special.governmentEntity", "Indica si el comprador es una entidad gubernamental")
    special = {
      regime: text(entry.regime, "fiscal.special.regime", 100), exemptionReference: text(entry.exemptionReference, "fiscal.special.exemptionReference", 200),
      governmentEntity: entry.governmentEntity as boolean | undefined, purchaseOrder: text(entry.purchaseOrder, "fiscal.special.purchaseOrder", 20), purchaseOrderDate: calendarDate(entry.purchaseOrderDate, "fiscal.special.purchaseOrderDate"),
      exportMode: mode as NonNullable<FiscalSaleCommand["special"]>["exportMode"], destinationCountry: country(entry.destinationCountry, "fiscal.special.destinationCountry"),
      shipmentNumber: text(entry.shipmentNumber, "fiscal.special.shipmentNumber", 25), containerNumber: text(entry.containerNumber, "fiscal.special.containerNumber", 100), departurePort: text(entry.departurePort, "fiscal.special.departurePort", 40), deliveryTerms: text(entry.deliveryTerms, "fiscal.special.deliveryTerms", 3),
    }
  }
  if (type === "E44" && (!special?.regime || !special.exemptionReference)) return invalid("fiscal.special", "Indica el régimen y el soporte de exención")
  if (type === "E45" && special?.governmentEntity !== true) return invalid("fiscal.special.governmentEntity", "Confirma que el comprador es una entidad gubernamental elegible")
  if (type === "E46" && (!special?.exportMode || !special.destinationCountry)) return invalid("fiscal.special", "Indica la modalidad y el país de destino")
  if (["E31", "E32"].includes(type) && special && Object.values(special).some(item => item !== undefined)) return invalid("fiscal.special", "Este comprobante no admite datos especiales")
  if (type !== "E44" && (special?.regime || special?.exemptionReference)) return invalid("fiscal.special", "El soporte de régimen especial solo corresponde a E44")
  if (type !== "E45" && (special?.governmentEntity !== undefined || special?.purchaseOrder || special?.purchaseOrderDate)) return invalid("fiscal.special", "La referencia gubernamental solo corresponde a E45")
  if (type !== "E46" && (special?.exportMode || special?.destinationCountry || special?.shipmentNumber || special?.containerNumber || special?.departurePort || special?.deliveryTerms)) return invalid("fiscal.special", "Los datos de exportación solo corresponden a E46")
  return { type, expectedPolicyVersion: body.expectedPolicyVersion as number, ...(body.expectedTotalCents !== undefined ? { expectedTotalCents: body.expectedTotalCents as number } : {}), incomeType, ...(buyer ? { buyer } : {}), ...(dueDate ? { dueDate } : {}), ...(shippingTaxTreatment ? { shippingTaxTreatment: shippingTaxTreatment as "EXENTO" | "TASA_CERO" } : {}), ...(special ? { special } : {}) }
}
