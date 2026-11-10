import { DO_ECF_TYPES } from "./catalog"

// Estas reglas son locales y deben contrastarse antes de conectar un proveedor.
export const DO_ECF_RULES = {
  version: "DO_ECF_2026_11_09_13",
  effectiveFrom: "2026-11-09",
  reviewedAt: "2026-11-09",
  source: "https://www.dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Formatos%20XML/Formato%20Comprobante%20Fiscal%20Electr%C3%B3nico%20%28e-CF%29%20v1.0.pdf",
  specialReceiptsSource: "https://dgii.gov.do/legislacion/normasGenerales/Documents/NG%20sobre%20Comprobantes%20Fiscales/Norma05-19.pdf",
  creditNotesSource: "https://ayuda.dgii.gov.do/conversations/facturacin-electrnica/ca4275-cmo-puedo-corregir-o-anular-un-comprobante-electrnico-ecf/5f3c17c98cd858ce87aabafb",
  types: Object.fromEntries(DO_ECF_TYPES.map(type => [type, {
    expiry: !["E32", "E34"].includes(type),
    referenceRequired: ["E33", "E34"].includes(type),
    buyerAllowed: type !== "E43",
    buyerRequired: ["E31", "E41", "E44", "E45"].includes(type),
    incomeType: ["E31", "E32", "E33", "E34", "E44", "E45", "E46"].includes(type) ? "required" : "forbidden",
    paymentType: ["E43", "E47"].includes(type) ? "optional" : "required",
    retention: ["E41", "E47"].includes(type) ? "required" : ["E31", "E33", "E34"].includes(type) ? "optional" : "forbidden",
    requiredTreatment: ["E43", "E44", "E47"].includes(type) ? "EXENTO" : type === "E46" ? "TASA_CERO" : null,
  }])) as Record<(typeof DO_ECF_TYPES)[number], { expiry: boolean; referenceRequired: boolean; buyerAllowed: boolean; buyerRequired: boolean; incomeType: "required" | "forbidden"; paymentType: "required" | "optional"; retention: "required" | "optional" | "forbidden"; requiredTreatment: string | null }>,
} as const
