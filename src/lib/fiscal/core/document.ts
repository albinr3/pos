import { Decimal } from "@prisma/client/runtime/library"
import { DO_ECF_RULES } from "../profiles/do-ecf/rules"
import { DO_ECF_TYPES } from "../profiles/do-ecf/catalog"
import { FISCAL_COUNTRIES } from "./countries"

const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP })
type Dec = InstanceType<typeof D>
const zero = () => new D(0)
const round = (n: Dec) => n.toDecimalPlaces(2, D.ROUND_HALF_UP)
const amount = (n: Dec) => round(n).toFixed(2)
type Obj = Record<string, unknown>
export type FiscalFieldError = { field: string; message: string }
export class FiscalDocumentError extends Error {
  constructor(public code: string, message: string, public status: number, public issues: FiscalFieldError[] = []) { super(message) }
}
const issue = (field: string, message: string): never => { throw new FiscalDocumentError("DOCUMENT_VALIDATION_FAILED", "Revisa los datos del documento", 422, [{ field, message }]) }
const malformed = (field: string, message: string): never => { throw new FiscalDocumentError("INVALID_INPUT", message, 400, [{ field, message }]) }
function object(value: unknown, field: string, keys: string[]): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) return malformed(field, "Se esperaba un objeto")
  const obj = value as Obj
  const extra = Object.keys(obj).find(key => !keys.includes(key))
  if (extra) return malformed(`${field}.${extra}`, "Campo no admitido")
  return obj
}
function str(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) return issue(field, "Dato obligatorio o inválido")
  return value.trim()
}
function decimal(value: unknown, field: string, scale: number, positive = false): Dec {
  if (typeof value !== "string" || !new RegExp(`^\\d{1,12}(?:\\.\\d{1,${scale}})?$`).test(value)) return issue(field, `Usa un decimal no negativo con hasta ${scale} decimales`)
  const n = new D(value)
  if (positive && n.lte(0)) return issue(field, "Debe ser mayor que cero")
  return n
}
function date(value: unknown, field: string): string {
  const s = str(value, field, 10)
  const d = new Date(`${s}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) return issue(field, "Fecha inválida; usa AAAA-MM-DD")
  return s
}
function optionalId(value: unknown, field: string) { return value === undefined ? undefined : str(value, field, 100) }

export function calculateFiscalDocument(input: unknown, policyVersion: number) {
  const body = object(input, "body", ["type", "issueDate", "expectedPolicyVersion", "currency", "issuer", "buyer", "supplier", "reference", "source", "lines", "globalDiscount", "incomeType", "payment"])
  const type = str(body.type, "type") as (typeof DO_ECF_TYPES)[number]
  if (!DO_ECF_TYPES.includes(type)) return issue("type", "Tipo de comprobante no admitido")
  const rules = DO_ECF_RULES.types[type]
  const issueDate = date(body.issueDate, "issueDate")
  if (issueDate < DO_ECF_RULES.effectiveFrom) return issue("issueDate", "No hay una versión de reglas disponible para esta fecha")
  let incomeType: string | null = null
  if (rules.incomeType === "required") {
    incomeType = str(body.incomeType, "incomeType", 2)
    if (!["01", "02", "03", "04", "05", "06"].includes(incomeType)) return issue("incomeType", "Tipo de ingreso no admitido")
  } else if (body.incomeType !== undefined) return issue("incomeType", "Este comprobante no admite tipo de ingreso")
  let payment: { type: string; dueDate: string | null } | null = null
  if (body.payment !== undefined || rules.paymentType === "required") {
    if (body.payment === undefined) return issue("payment", "Indica el tipo de pago")
    const p = object(body.payment, "payment", ["type", "dueDate"])
    const paymentType = str(p.type, "payment.type")
    if (!["CONTADO", "CREDITO", "GRATUITO"].includes(paymentType)) return issue("payment.type", "Tipo de pago no admitido")
    if (paymentType !== "CREDITO" && p.dueDate !== undefined) return issue("payment.dueDate", "La fecha límite solo aplica a crédito")
    // E43 no admite ese campo y en E47 es opcional: no confundir su ausencia con prohibir crédito.
    if (type === "E43" && p.dueDate !== undefined) return issue("payment.dueDate", "E43 no admite fecha límite en el comprobante")
    const requiresDueDate = paymentType === "CREDITO" && type !== "E43" && type !== "E47"
    const dueDate = requiresDueDate || p.dueDate !== undefined ? date(p.dueDate, "payment.dueDate") : null
    if (dueDate && dueDate < issueDate) return issue("payment.dueDate", "La fecha límite no puede preceder a la emisión")
    payment = { type: paymentType, dueDate }
  }
  const currency = object(body.currency, "currency", ["operation", "reporting", "rate", "rateDate"])
  const operation = str(currency.operation, "currency.operation", 3).toUpperCase()
  if (!/^[A-Z]{3}$/.test(operation)) return issue("currency.operation", "Usa un código de moneda de tres letras")
  if (currency.reporting !== "DOP") return issue("currency.reporting", "La moneda de reporte debe ser DOP")
  const rate = operation === "DOP" ? new D(1) : decimal(currency.rate, "currency.rate", 4, true)
  const rateDate = operation === "DOP" ? null : date(currency.rateDate, "currency.rateDate")
  if (operation === "DOP" && (currency.rate !== undefined || currency.rateDate !== undefined)) return issue("currency", "DOP no necesita tasa ni fecha de cambio")
  const party = (value: unknown, field: string) => {
    const p = object(value, field, field === "supplier" ? ["id", "name", "identification", "country", "residence", "declaredCondition"] : ["id", "name", "identification", "country"])
    const country = str(p.country, `${field}.country`, 2).toUpperCase()
    // Dos letras arbitrarias no acreditan un país: usar el mismo catálogo que las fichas fiscales.
    if (!FISCAL_COUNTRIES.some(entry => entry.code === country)) return issue(`${field}.country`, "Selecciona un país admitido")
    const residence = p.residence === undefined ? null : str(p.residence, `${field}.residence`, 2).toUpperCase()
    if (residence && !FISCAL_COUNTRIES.some(entry => entry.code === residence)) return issue(`${field}.residence`, "Selecciona un país de residencia admitido")
    const declaredCondition = p.declaredCondition === undefined ? null : str(p.declaredCondition, `${field}.declaredCondition`)
    if (declaredCondition && !["REGISTRADO", "NO_REGISTRADO", "EXTRANJERO", "OTRO"].includes(declaredCondition)) return issue(`${field}.declaredCondition`, "Condición declarada no admitida")
    const identification = str(p.identification, `${field}.identification`, country === "DO" ? 11 : 20)
    // No convertir silenciosamente una identificación extranjera en RNC ni aceptar un RNC incompleto.
    if (country === "DO" && !/^(?:\d{9}|\d{11})$/.test(identification)) return issue(`${field}.identification`, "El RNC o cédula debe contener 9 u 11 dígitos, sin separadores")
    return { id: optionalId(p.id, `${field}.id`), name: str(p.name, `${field}.name`, 150), identification, country, ...(field === "supplier" ? { residence, declaredCondition } : {}) }
  }
  const issuer = party(body.issuer, "issuer")
  if (issuer.country !== "DO") return issue("issuer.country", "El perfil DO_ECF requiere un emisor de República Dominicana")
  const buyer = body.buyer === undefined ? null : party(body.buyer, "buyer")
  const supplier = body.supplier === undefined ? null : party(body.supplier, "supplier")
  if (!rules.buyerAllowed && buyer) return issue("buyer", "Este comprobante no admite comprador")
  // E41 usa el proveedor como contraparte en la copia; no exigir un comprador duplicado.
  if (rules.buyerRequired && type !== "E41" && !buyer) return issue("buyer", "Indica el comprador")
  // E31 y E45 requieren RNC o cédula del comprador; el identificador extranjero no sustituye ese campo.
  if (["E31", "E45"].includes(type) && buyer?.country !== "DO") return issue("buyer.country", "Este comprobante requiere RNC o cédula dominicana del comprador")
  if (["E41", "E47"].includes(type) && !supplier) return issue("supplier", "Indica el proveedor")
  // El país de identificación no prueba la residencia tributaria del beneficiario.
  if (type === "E47" && !supplier?.residence) return issue("supplier.residence", "Indica la residencia fiscal del beneficiario")
  if (type === "E47" && supplier?.residence === "DO") return issue("supplier.residence", "E47 requiere un beneficiario no residente fiscal en República Dominicana")
  if (type === "E47" && supplier?.country === "DO") return issue("supplier.country", "Indica el país de la identificación extranjera")
  if (type === "E41" && supplier?.declaredCondition !== "NO_REGISTRADO") return issue("supplier.declaredCondition", "Declara que el proveedor no está registrado como contribuyente")
  let reference: { documentId: string; issueDate: string; modificationCode: string; creditIndicator: number | null } | null = null
  if (rules.referenceRequired) {
    const r = object(body.reference, "reference", ["documentId", "issueDate", "modificationCode"])
    const referenceDate = date(r.issueDate, "reference.issueDate")
    const days = (new Date(`${issueDate}T00:00:00Z`).getTime() - new Date(`${referenceDate}T00:00:00Z`).getTime()) / 86400000
    if (days < 0) return issue("reference.issueDate", "La referencia no puede ser posterior al documento")
    const modificationCode = str(r.modificationCode, "reference.modificationCode", 3)
    if (type === "E33" && modificationCode !== "3") return issue("reference.modificationCode", "E33 requiere código 3")
    if (type === "E34" && !["1", "2", "3"].includes(modificationCode)) return issue("reference.modificationCode", "E34 admite los códigos 1, 2 o 3")
    reference = { documentId: str(r.documentId, "reference.documentId", 100), issueDate: referenceDate, modificationCode, creditIndicator: type === "E34" ? (days <= 30 ? 0 : 1) : null }
  } else if (body.reference !== undefined) return issue("reference", "Este tipo no admite referencia en esta previsualización")
  let source: { kind: string; id: string } | null = null
  if (body.source !== undefined) {
    const s = object(body.source, "source", ["kind", "id"])
    const kind = str(s.kind, "source.kind")
    if (!["SALE", "PURCHASE", "PAYABLE", "RETURN", "EXPENSE", "SUPPLIER_PAYMENT"].includes(kind)) return issue("source.kind", "Origen no admitido")
    source = { kind, id: str(s.id, "source.id", 100) }
  }
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100) return issue("lines", "Indica entre una y cien líneas")
  const rates: Record<string, string> = { GRAVADO_18: "18", GRAVADO_16: "16", TASA_CERO: "0", EXENTO: "0", NO_FACTURABLE: "0" }
  const lines = body.lines.map((value, index) => {
    const field = `lines.${index}`
    const l = object(value, field, ["originalLine", "productId", "conceptId", "description", "kind", "unit", "quantity", "unitPrice", "taxTreatment", "priceIncludesTax", "discount", "surcharge", "withholdings", "retentionAgent"])
    if (l.originalLine !== undefined && (type !== "E34" || !Number.isSafeInteger(l.originalLine) || (l.originalLine as number) < 1)) return issue(`${field}.originalLine`, "Indica el número de línea original para una E34")
    const originalLine = l.originalLine as number | undefined
    const productId = optionalId(l.productId, `${field}.productId`), conceptId = optionalId(l.conceptId, `${field}.conceptId`)
    if (productId && conceptId) return issue(field, "Escoge producto o concepto")
    const kind = str(l.kind, `${field}.kind`)
    if (!["BIEN", "SERVICIO", "ENVIO", "PROPINA", "RECARGO"].includes(kind)) return issue(`${field}.kind`, "Clasificación no admitida")
    const treatment = str(l.taxTreatment, `${field}.taxTreatment`)
    if (!Object.prototype.hasOwnProperty.call(rates, treatment)) return issue(`${field}.taxTreatment`, "Tratamiento no admitido")
    if (rules.requiredTreatment && treatment !== rules.requiredTreatment) return issue(`${field}.taxTreatment`, `Este tipo exige ${rules.requiredTreatment}`)
    if (type === "E47" && kind !== "SERVICIO") return issue(`${field}.kind`, "E47 requiere servicios")
    // La exportación de servicios se documenta con consumo; E46 corresponde a bienes.
    if (type === "E46" && kind === "SERVICIO") return issue(`${field}.kind`, "Los servicios exportados requieren factura de consumo")
    if (typeof l.priceIncludesTax !== "boolean") return issue(`${field}.priceIncludesTax`, "Indica si el precio incluye impuesto")
    const quantity = decimal(l.quantity, `${field}.quantity`, 2, true), price = decimal(l.unitPrice, `${field}.unitPrice`, 4)
    const discount = l.discount === undefined ? zero() : decimal(l.discount, `${field}.discount`, 2)
    const surcharge = l.surcharge === undefined ? zero() : decimal(l.surcharge, `${field}.surcharge`, 2)
    const lineAmount = round(quantity.mul(price)).minus(discount).plus(surcharge)
    if (lineAmount.lt(0)) return issue(`${field}.discount`, "El descuento supera el importe de la línea")
    // DGII exige MontoItem cero en E34 con código 2; no basta con anular solo el efecto financiero.
    if (type === "E34" && reference?.modificationCode === "2" && !lineAmount.isZero()) return issue(`${field}.unitPrice`, "La corrección de texto requiere importe de línea igual a cero")
    if (l.withholdings !== undefined && (!Array.isArray(l.withholdings) || l.withholdings.length > 2)) return issue(`${field}.withholdings`, "Retenciones inválidas")
    if (rules.retention === "forbidden" && (l.withholdings !== undefined || l.retentionAgent !== undefined)) return issue(`${field}.withholdings`, "Este comprobante no admite retenciones")
    const retentionAgent = l.retentionAgent === undefined ? null : str(l.retentionAgent, `${field}.retentionAgent`, 1)
    if (retentionAgent !== null && retentionAgent !== "1") return issue(`${field}.retentionAgent`, "Solo se admite el indicador de agente retenedor 1")
    if ((rules.retention === "required" || (Array.isArray(l.withholdings) && l.withholdings.length > 0)) && !retentionAgent) return issue(`${field}.retentionAgent`, "Indica el agente retenedor")
    const withholdings = ((l.withholdings ?? []) as unknown[]).map((value, i) => {
      const w = object(value, `${field}.withholdings.${i}`, ["kind", "rate", "amount"])
      const wkind = str(w.kind, `${field}.withholdings.${i}.kind`)
      if (!["ISR", "ITBIS"].includes(wkind)) return issue(`${field}.withholdings.${i}.kind`, "Retención no admitida")
      const wrate = decimal(w.rate, `${field}.withholdings.${i}.rate`, 4)
      if (wrate.gt(100)) return issue(`${field}.withholdings.${i}.rate`, "La tasa no puede superar 100")
      if (w.amount !== undefined && (type !== "E47" || wkind !== "ISR")) return issue(`${field}.withholdings.${i}.amount`, "El importe explícito solo corresponde a ISR de E47")
      const allocatedAmount = w.amount === undefined ? null : decimal(w.amount, `${field}.withholdings.${i}.amount`, 2)
      return { kind: wkind, rate: wrate, allocatedAmount }
    })
    if (new Set(withholdings.map(w => w.kind)).size !== withholdings.length) return issue(`${field}.withholdings`, "Retención duplicada")
    if (treatment === "NO_FACTURABLE" && withholdings.length) return issue(`${field}.withholdings`, "Una línea no facturable no admite retenciones")
    if (type === "E47" && !withholdings.some(w => w.kind === "ISR" && w.rate.gt(0))) return issue(`${field}.withholdings`, "E47 requiere retención ISR por línea")
    if (type === "E47" && withholdings.some(w => w.kind === "ITBIS")) return issue(`${field}.withholdings`, "E47 no admite retención de ITBIS")
    if (type === "E41" && kind === "BIEN" && withholdings.some(w => w.kind === "ISR")) return issue(`${field}.withholdings`, "La retención ISR de E41 corresponde a servicios")
    // En E41 el ITBIS facturado se retiene íntegramente; no aceptar porcentajes parciales ni omitirlo.
    if (type === "E41" && treatment.startsWith("GRAVADO_") && !withholdings.some(w => w.kind === "ITBIS" && w.rate.eq(100))) return issue(`${field}.withholdings`, "E41 requiere retener el 100 % del ITBIS gravado")
    if (type === "E34" && reference?.creditIndicator === 1 && withholdings.some(w => w.kind === "ITBIS" && w.rate.gt(0))) return issue(`${field}.withholdings`, "El ITBIS fuera de plazo no puede generar una retención reembolsable")
    return { originalLine, productId, conceptId, description: str(l.description, `${field}.description`), kind, unit: str(l.unit, `${field}.unit`), quantity, price, treatment, includes: l.priceIncludesTax, discount, surcharge, lineAmount, withholdings, retentionAgent, rate: new D(rates[treatment]) }
  })
  if (type === "E46" && !lines.some(l => l.kind === "BIEN")) return issue("lines", "E46 requiere al menos un bien exportado")
  // DGII usa un indicador común para las líneas gravadas; no mezclar modos silenciosamente.
  if (new Set(lines.filter(l => l.rate.gt(0)).map(l => l.includes)).size > 1) return issue("lines", "Las líneas gravadas deben usar el mismo modo de precio con o sin ITBIS")
  const globalDiscount = body.globalDiscount === undefined ? zero() : decimal(body.globalDiscount, "globalDiscount", 2)
  const eligible = lines.map((l, index) => ({ index, weight: ["BIEN", "SERVICIO"].includes(l.kind) && l.treatment !== "NO_FACTURABLE" ? l.lineAmount : zero() }))
  const totalWeight = eligible.reduce((s, x) => s.plus(x.weight), zero())
  if (globalDiscount.gt(totalWeight)) return issue("globalDiscount", "El descuento supera el importe elegible")
  // El resto se reparte por fracción descendente y orden original: siempre suma el descuento exacto.
  const shares = eligible.map(x => { const exact = totalWeight.isZero() ? zero() : globalDiscount.mul(x.weight).div(totalWeight); const floor = exact.toDecimalPlaces(2, D.ROUND_DOWN); return { ...x, share: floor, fraction: exact.minus(floor) } })
  let centsLeft = globalDiscount.minus(shares.reduce((s, x) => s.plus(x.share), zero())).mul(100).toNumber()
  for (const x of [...shares].sort((a, b) => b.fraction.comparedTo(a.fraction) || a.index - b.index)) { if (centsLeft-- <= 0) break; x.share = x.share.plus("0.01") }
  const bases: Record<string, Dec> = Object.fromEntries(Object.keys(rates).map(k => [k, zero()]))
  // Mantener ISR e ITBIS separados, incluso cuando el importe exigido sea cero.
  const withheldByKind: Record<string, Dec> = { ISR: zero(), ITBIS: zero() }
  let totalTax = zero(), totalWithheld = zero(), totalBillable = zero(), taxNotCreditable = zero(), legalTip = zero()
  const calculatedLines = lines.map((l, i) => {
    const value = l.lineAmount.minus(shares[i].share)
    const base = l.includes && l.rate.gt(0) ? round(value.div(new D(1).plus(l.rate.div(100)))) : value
    const referenceTax = l.rate.isZero() ? zero() : l.includes ? value.minus(base) : round(base.mul(l.rate).div(100))
    // El indicador no vuelve exenta la línea: conservar el impuesto documentado y separar el que no se devuelve.
    const tax = referenceTax
    const nonCreditable = type === "E34" && reference?.creditIndicator === 1 ? referenceTax : zero()
    taxNotCreditable = taxNotCreditable.plus(nonCreditable)
    const gross = base.plus(tax)
    // La propina legal de una venta es impuesto adicional 001, no una base exenta de ITBIS.
    if (source?.kind === "SALE" && l.kind === "PROPINA") {
      if (l.rate.gt(0) || l.withholdings.length || l.treatment === "NO_FACTURABLE") return issue(`lines.${i}.taxTreatment`, "La propina legal no puede convertirse en una base gravada ni no facturable")
      legalTip = legalTip.plus(gross)
    } else bases[l.treatment] = bases[l.treatment].plus(base)
    const withholdings = l.withholdings.map(w => { const withholdingBase = w.kind === "ITBIS" ? tax : base; const calculated = round(withholdingBase.mul(w.rate).div(100)); const retained = w.allocatedAmount ?? calculated; /* La diferencia de un centavo solo se admite para repartir el ISR acumulado entre abonos. */ if (retained.minus(calculated).abs().gt("0.01")) return issue(`lines.${i}.withholdings`, "El ISR asignado no coincide con la tasa"); totalWithheld = totalWithheld.plus(retained); withheldByKind[w.kind] = withheldByKind[w.kind].plus(retained); return { kind: w.kind, rate: w.rate.toString(), base: amount(withholdingBase), amount: amount(retained) } })
    if (l.treatment !== "NO_FACTURABLE") { totalTax = totalTax.plus(tax); totalBillable = totalBillable.plus(gross) }
    // En las líneas exentas con agente retenedor el formato exige ITBIS retenido cero; E47 no admite ese campo.
    if (["E31", "E33", "E34", "E41"].includes(type) && l.treatment === "EXENTO" && l.retentionAgent && !withholdings.some(w => w.kind === "ITBIS")) withholdings.push({ kind: "ITBIS", rate: "0", base: "0.00", amount: "0.00" })
    return { originalLine: l.originalLine, productId: l.productId, conceptId: l.conceptId, description: l.description, kind: l.kind, unit: l.unit, quantity: l.quantity.toFixed(2), unitPrice: l.price.toFixed(4), taxTreatment: l.treatment, priceIncludesTax: l.includes, discount: amount(l.discount), surcharge: amount(l.surcharge), globalDiscount: amount(shares[i].share), base: amount(base), tax: amount(tax), taxNotCreditable: amount(nonCreditable), gross: amount(gross), retentionAgent: l.retentionAgent, withholdings }
  })
  const textOnly = type === "E34" && reference?.modificationCode === "2"
  const amountEligible = totalBillable.minus(taxNotCreditable)
  if (totalWithheld.gt(amountEligible)) return issue("lines", "Las retenciones superan el total elegible")
  // La copia original conserva sus importes; la nota de corrección de texto no genera crédito ni reembolso.
  const creditEligible = textOnly ? zero() : amountEligible
  const net = textOnly ? zero() : creditEligible.minus(totalWithheld)
  const totals = { bases: Object.fromEntries(Object.entries(bases).map(([k, v]) => [k, amount(v)])), tax: amount(totalTax), ...(legalTip.gt(0) ? { additionalTaxes: [{ code: "001", amount: amount(legalTip) }] } : {}), taxNotCreditable: amount(taxNotCreditable), globalDiscount: amount(globalDiscount), gross: amount(totalBillable), creditEligible: amount(creditEligible), withheld: amount(totalWithheld), withheldByKind: { ISR: amount(withheldByKind.ISR), ITBIS: amount(withheldByKind.ITBIS) }, net: amount(net) }
  const reportingGross = round(totalBillable.mul(rate)), reportingWithheld = round(totalWithheld.mul(rate))
  const reportingIneligible = round(taxNotCreditable.mul(rate))
  if (type === "E32" && reportingGross.gte(250000) && !buyer) return issue("buyer", "Para consumo desde DOP 250,000 se requiere identificar al comprador")
  // Las declaraciones locales no sustituyen la verificación de elegibilidad de las etapas posteriores.
  const pendingEligibility: Partial<Record<(typeof DO_ECF_TYPES)[number], string>> = {
    E41: "La condición declarada del proveedor requiere verificación oficial.",
    E43: "La elegibilidad del gasto y su pago requieren revisión.",
    E44: "La exención y sus soportes requieren revisión.",
    E45: "La elegibilidad de la entidad gubernamental requiere revisión.",
    E46: "La operación y sus datos de exportación requieren revisión.",
    E47: "La elegibilidad del pago al exterior y la residencia requieren revisión.",
  }
  const pendingWarning = pendingEligibility[type]
  const reportingEligible = textOnly ? zero() : reportingGross.minus(reportingIneligible)
  const reportingNet = textOnly ? zero() : reportingEligible.minus(reportingWithheld)
  // El saldo requiere conciliar notas anteriores y reservas: no presentar un límite individual como validación del saldo.
  const balanceWarning = type === "E34" && !textOnly ? reference?.modificationCode === "1" ? "La anulación total requiere que el importe de la nota coincida con el saldo pendiente; ese saldo aún no se verifica." : "El saldo pendiente y las notas anteriores aún no se verifican." : null
  // El tipo gratuito no da crédito fiscal y el neto matemático no representa un cobro autorizado.
  const freeWarning = payment?.type === "GRATUITO" ? "La entrega gratuita no da derecho a crédito fiscal; el neto mostrado no representa un cobro." : null
  return { type, issueDate, issuer, buyer, supplier, reference, source, incomeType, payment, currency: { operation, reporting: "DOP", rate: rate.toFixed(4), rateDate }, policyVersion, ruleVersion: DO_ECF_RULES.version, state: "BORRADOR", externalResult: null, lines: calculatedLines, totals, reportingTotals: { gross: amount(reportingGross), taxNotCreditable: amount(reportingIneligible), creditEligible: amount(reportingEligible), withheld: amount(reportingWithheld), net: amount(reportingNet) }, warnings: ["Previsualización local: no es un comprobante emitido.", ...(taxNotCreditable.gt(0) ? ["El ITBIS de referencia no se devuelve ni se rebaja después de 30 días."] : []), ...(textOnly ? ["La corrección de texto no modifica el importe ni genera crédito o reembolso."] : []), ...(balanceWarning ? [balanceWarning] : []), ...(freeWarning ? [freeWarning] : []), ...(pendingWarning ? [pendingWarning] : [])] }
}
