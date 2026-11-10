import { FISCAL_COUNTRIES } from "./countries.ts"

// Son clasificaciones de captura, no certifican elegibilidad ni sustituyen las reglas del documento.
export const FISCAL_MASTER_CATALOG = {
  identificationTypes: [{ code: "RNC", name: "RNC" }, { code: "CEDULA", name: "Cédula" }, { code: "PASAPORTE", name: "Pasaporte" }, { code: "EXTRANJERA", name: "Identificación extranjera" }, { code: "OTRO", name: "Otro documento" }],
  countries: FISCAL_COUNTRIES,
  declaredConditions: [{ code: "REGISTRADO", name: "Contribuyente registrado" }, { code: "NO_REGISTRADO", name: "No registrado" }, { code: "EXTRANJERO", name: "Extranjero" }, { code: "OTRO", name: "Otra condición" }],
  itemTypes: [{ code: "BIEN", name: "Producto" }, { code: "SERVICIO", name: "Servicio" }],
  taxTreatments: [{ code: "GRAVADO", name: "Gravado" }, { code: "TASA_CERO", name: "Tasa cero" }, { code: "EXENTO", name: "Exento" }, { code: "NO_FACTURABLE", name: "No facturable" }],
  receiptTypes: [{ code: "E31", name: "Crédito fiscal" }, { code: "E32", name: "Consumo" }, { code: "E44", name: "Regímenes especiales" }, { code: "E45", name: "Gubernamental" }, { code: "E46", name: "Exportaciones" }],
} as const

export class FiscalMasterDataError extends Error {
  field: string
  constructor(message: string, field: string) { super(message); this.field = field; this.name = "FiscalMasterDataError" }
}

// Los campos omitidos se conservan para clientes de API anteriores.
export const customerFiscalFields = ["fiscalIdentificationType", "fiscalIdentificationCountry", "fiscalIdentification", "fiscalLegalName", "fiscalEmail", "fiscalAddress", "fiscalPreferredReceiptType"] as const
export const supplierFiscalFields = ["fiscalLegalName", "fiscalIdentificationType", "fiscalIdentificationCountry", "fiscalIdentification", "fiscalResidence", "fiscalDeclaredCondition"] as const
export const productFiscalFields = ["fiscalItemType", "fiscalUnit", "fiscalTaxTreatment"] as const
export type FiscalFields<K extends string> = Partial<Record<K, string | null>>
export function fiscalFields<K extends string>(input: Partial<Record<K, unknown>>, keys: readonly K[]): FiscalFields<K> {
  const result: FiscalFields<K> = {}
  for (const key of keys) {
    const value = input[key]
    if (value === undefined) continue
    if (value !== null && typeof value !== "string") throw new FiscalMasterDataError(`Valor inválido para ${key}`, key)
    const trimmed = typeof value === "string" ? value.trim() : null
    if (trimmed && trimmed.length > 200) throw new FiscalMasterDataError(`${key} excede 200 caracteres`, key)
    result[key] = trimmed || null
  }
  return result
}

export function validateFiscalCatalogFields(input: Record<string, unknown>, existing: Record<string, unknown> = {}) {
  const catalogByField: Record<string, readonly { code: string }[]> = {
    fiscalIdentificationType: FISCAL_MASTER_CATALOG.identificationTypes,
    fiscalIdentificationCountry: FISCAL_MASTER_CATALOG.countries,
    fiscalResidence: FISCAL_MASTER_CATALOG.countries,
    fiscalDeclaredCondition: FISCAL_MASTER_CATALOG.declaredConditions,
    fiscalItemType: FISCAL_MASTER_CATALOG.itemTypes,
    fiscalTaxTreatment: FISCAL_MASTER_CATALOG.taxTreatments,
    fiscalPreferredReceiptType: FISCAL_MASTER_CATALOG.receiptTypes,
  }
  for (const [field, catalog] of Object.entries(catalogByField)) {
    const value = input[field]
    if (value == null || value === "") continue
    if (typeof value !== "string") throw new FiscalMasterDataError(`Valor inválido para ${field}`, field)
    // Una ficha antigua puede conservar un valor libre; no se autoriza introducir otro desconocido.
    if (value === existing[field]) continue
    const values = field === "fiscalPreferredReceiptType" ? parsePreferredReceiptTypes(value) : [value]
    const previous = field === "fiscalPreferredReceiptType" && typeof existing[field] === "string" ? parsePreferredReceiptTypes(existing[field] as string) : []
    if (!values.length || values.some(code => !catalog.some(option => option.code === code) && !previous.includes(code)))
      throw new FiscalMasterDataError(`Valor no admitido para ${field}`, field)
  }
}

// El campo anterior sigue siendo texto: los valores múltiples se codifican sin migrar fichas antiguas.
export function parsePreferredReceiptTypes(value: string | null | undefined): string[] {
  if (!value) return []
  if (value.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) return parsed
    } catch { /* Un texto histórico no es necesariamente JSON. */ }
  }
  return [value]
}
export function encodePreferredReceiptTypes(input: unknown): string | null {
  if (!Array.isArray(input) || input.some(item => typeof item !== "string" || !item.trim() || item.trim().length > 100)) throw new FiscalMasterDataError("Comprobantes preferidos inválidos", "fiscalPreferredReceiptTypes")
  const values: string[] = [...new Set<string>(input.map(item => item.trim()))]
  const encoded = values.length > 1 ? JSON.stringify(values) : values[0] ?? null
  if (encoded && encoded.length > 200) throw new FiscalMasterDataError("Demasiados comprobantes preferidos", "fiscalPreferredReceiptTypes")
  return encoded
}
export function preferredReceiptResponse(value: string | null | undefined) {
  const types = parsePreferredReceiptTypes(value)
  return { fiscalPreferredReceiptType: types[0] ?? null, fiscalPreferredReceiptTypes: types }
}
export function preferredReceiptInput(body: Record<string, unknown>) {
  return body.fiscalPreferredReceiptTypes === undefined ? {} : { fiscalPreferredReceiptType: encodePreferredReceiptTypes(body.fiscalPreferredReceiptTypes) }
}

export function preserveLegacyPreferredReceipts(value: string | null | undefined, existing: string | null, legacy: boolean): string | null | undefined {
  // Reenviar el primer comprobante desde una app antigua no elimina los demás.
  return legacy && value !== undefined && value !== null && value === parsePreferredReceiptTypes(existing)[0] ? undefined : value
}
