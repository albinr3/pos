import { createHash, randomUUID } from "node:crypto"
import { Decimal } from "@prisma/client/runtime/library"
import { PaymentMethod, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { cashRequest, withCashOperation, type CashOperationInput } from "@/lib/cash-context"
import { requireTreasuryAccount } from "@/lib/treasury"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { FiscalDocumentError } from "./document"
import { previewFiscalDocument } from "./preview"
import { creditCapacity, validateCreditUses, CreditCapacityError, type CreditOriginalLine, type CreditUse } from "./credit-capacity"
import { reserveFiscalNumber } from "./sequences"
import { logAuditEvent } from "@/lib/audit-log"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Tx = Prisma.TransactionClient
type Obj = Record<string, unknown>
type RequestedLine = { originalLine: number; quantity: string; physicalQuantity: string; extraDiscountCents: number; description?: string }
type Command = { originalDocumentId: string; expectedPolicyVersion: number; modificationCode: string; reason: string; lines: RequestedLine[] }
type Adjustment = { id: string; accountId: string; originalDocumentId: string; actorUserId: string; fiscalDocumentId: string | null; type: string; state: string; revision: number; policyVersion: number; input: Command; snapshot: unknown }
type Original = { id: string; saleId: string | null; type: string; state: string; snapshot: Obj }
const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP })
const fail = (code: string, message: string, status = 422, field?: string): never => { throw new FiscalDocumentError(code, message, status, field ? [{ field, message }] : []) }
function object(value: unknown, field: string, allowed: string[]): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("INVALID_INPUT", `Objeto inválido: ${field}`, 400, field)
  const result = value as Obj
  const extra = Object.keys(result).find(key => !allowed.includes(key))
  if (extra) return fail("INVALID_INPUT", `Campo no admitido: ${extra}`, 400, `${field}.${extra}`)
  return result
}
function str(value: unknown, field: string, max = 100): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) return fail("INVALID_INPUT", "Dato obligatorio o inválido", 400, field)
  return value.trim()
}
function parse(raw: unknown): Command {
  const body = object(raw, "body", ["originalDocumentId", "expectedPolicyVersion", "modificationCode", "reason", "lines"])
  if (!Number.isSafeInteger(body.expectedPolicyVersion) || (body.expectedPolicyVersion as number) < 1) return fail("INVALID_INPUT", "Versión de política inválida", 400, "expectedPolicyVersion")
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100) return fail("INVALID_INPUT", "Indica entre una y cien líneas", 400, "lines")
  const lines = body.lines.map((rawLine, index): RequestedLine => {
    const line = object(rawLine, `lines.${index}`, ["originalLine", "quantity", "physicalQuantity", "extraDiscountCents", "description"])
    if (!Number.isSafeInteger(line.originalLine) || (line.originalLine as number) < 1) return fail("INVALID_INPUT", "Línea original inválida", 400, `lines.${index}.originalLine`)
    if (line.extraDiscountCents !== undefined && (!Number.isSafeInteger(line.extraDiscountCents) || (line.extraDiscountCents as number) < 0 || (line.extraDiscountCents as number) > 2147483647)) return fail("INVALID_INPUT", "Descuento inválido", 400, `lines.${index}.extraDiscountCents`)
    return { originalLine: line.originalLine as number, quantity: str(line.quantity, `lines.${index}.quantity`, 13), physicalQuantity: str(line.physicalQuantity ?? "0", `lines.${index}.physicalQuantity`, 13), extraDiscountCents: (line.extraDiscountCents as number | undefined) ?? 0, ...(line.description === undefined ? {} : { description: str(line.description, `lines.${index}.description`, 200) }) }
  })
  return { originalDocumentId: str(body.originalDocumentId, "originalDocumentId"), expectedPolicyVersion: body.expectedPolicyVersion as number, modificationCode: str(body.modificationCode, "modificationCode", 1), reason: str(body.reason, "reason", 500), lines }
}
function authorize(actor: Actor, view = false) {
  const permitted = view ? hasPermission(actor, "canViewFiscalDocuments") || hasPermission(actor, "canPrepareFiscalDocuments") : hasPermission(actor, "canPrepareFiscalDocuments")
  if (!permitted || !hasPermission(actor, "canAccessReturns")) fail("FORBIDDEN", "Sin permiso para consultar o preparar notas de crédito", 403)
}
async function lock(tx: Tx, accountId: string) {
  // Se conserva el orden de bloqueo usado por preparación y caja para evitar interbloqueos.
  await tx.$queryRaw`SELECT id FROM "Account" WHERE id=${accountId} FOR NO KEY UPDATE`
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${accountId},517))::text`
}
async function policy(tx: Tx, actor: Actor, version: number) {
  const settings = await tx.fiscalSettings.findUnique({ where: { accountId: actor.accountId } })
  if (!settings?.enabled || settings.jurisdiction !== "DO" || settings.regime !== "DO_ECF" || settings.environment !== "TEST" || settings.configurationStatus !== "VALIDATED") fail("PROFILE_UNAVAILABLE", "Activa una configuración fiscal válida de prueba", 409)
  if (settings?.version !== version) fail("VERSION_CONFLICT", "La política fiscal cambió", 409, "expectedPolicyVersion")
}
function dateToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) }
function party(value: unknown): Obj | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const p = value as Obj
  return { ...(typeof p.id === "string" ? { id: p.id } : {}), name: p.name, identification: p.identification, country: p.country }
}
function cents(value: unknown, field: string): number {
  if (typeof value !== "string" || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return fail("DOCUMENT_CONFLICT", "La copia original contiene un importe inválido", 409, field)
  const n = new D(value).mul(100)
  if (n.gt(2147483647)) return fail("DOCUMENT_CONFLICT", "El importe excede el límite admitido", 409, field)
  return n.toNumber()
}
function money(value: number) { return new D(value).div(100).toFixed(2) }
async function original(tx: Tx, actor: Actor, id: string, checkCreditHistory = true): Promise<Original> {
  const rows = await tx.$queryRaw<Original[]>`SELECT id,"saleId",type,state,snapshot FROM "FiscalDocument" WHERE "accountId"=${actor.accountId} AND id=${id} FOR UPDATE`
  const row = rows[0]
  if (!row) return fail("NOT_FOUND", "Documento original no encontrado", 404)
  if (!row.saleId || row.state !== "PREPARADO_PENDIENTE_CONEXION" || !["E31", "E32", "E44", "E45", "E46"].includes(row.type)) return fail("DOCUMENT_CONFLICT", "La referencia no es una venta fiscal preparada", 409, "originalDocumentId")
  const allocations = await tx.$queryRaw<Array<{ environment: string }>>`SELECT environment FROM "FiscalNumberAllocation" WHERE "accountId"=${actor.accountId} AND "documentId"=${id}`
  if (allocations[0]?.environment !== "TEST") return fail("DOCUMENT_CONFLICT", "La referencia no pertenece al ambiente de prueba", 409, "originalDocumentId")
  if (!checkCreditHistory) return row
  const undocumented = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "Return" r WHERE r."accountId"=${actor.accountId} AND r."saleId"=${row.saleId} AND r."cancelledAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "FiscalAdjustment" a WHERE a."accountId"=r."accountId" AND a.id=r."fiscalAdjustmentId" AND a.type='E34' AND a.state='PREPARADO_PENDIENTE_CONEXION') AND NOT EXISTS (SELECT 1 FROM "FiscalDocument" d WHERE d."accountId"=r."accountId" AND d."returnId"=r.id AND d.type='E34' AND d.state='PREPARADO_PENDIENTE_CONEXION')`
  const oldNotes = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "FiscalDocumentReference" r JOIN "FiscalDocument" d ON d."accountId"=r."accountId" AND d.id=r."documentId" WHERE r."accountId"=${actor.accountId} AND r."referencedDocumentId"=${id} AND d.type='E34' AND d.state='PREPARADO_PENDIENTE_CONEXION' AND NOT EXISTS (SELECT 1 FROM "FiscalAdjustment" a WHERE a."accountId"=d."accountId" AND a."fiscalDocumentId"=d.id AND a.state='PREPARADO_PENDIENTE_CONEXION')`
  // Una devolución o nota anterior sin aplicación conciliada no puede desaparecer del saldo disponible.
  if (undocumented[0]?.count || oldNotes[0]?.count) return fail("RECONCILIATION_REQUIRED", "La factura tiene devoluciones o notas anteriores que requieren conciliación", 409)
  return row
}
export { lock as lockFiscalAdjustmentAccount, policy as requireFiscalAdjustmentPolicy, original as getFiscalAdjustmentOriginal, command as runFiscalAdjustmentCommand, event as recordFiscalAdjustmentEvent, dateToday as fiscalAdjustmentToday, party as fiscalAdjustmentParty, canonical as canonicalFiscalAdjustment }
async function calculate(tx: Tx, actor: Actor, command: Command, excludedId?: string) {
  await policy(tx, actor, command.expectedPolicyVersion)
  const doc = await original(tx, actor, command.originalDocumentId)
  const snapshot = doc.snapshot
  const sourceLines = snapshot?.lines
  const currency = snapshot?.currency as Obj | undefined
  if (!Array.isArray(sourceLines) || !sourceLines.length || currency?.operation !== "DOP" || !party(snapshot.issuer) || typeof snapshot.issueDate !== "string") return fail("DOCUMENT_CONFLICT", "La copia original no permite revisar la nota", 409)
  const originals: CreditOriginalLine[] = sourceLines.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail("DOCUMENT_CONFLICT", "Línea original inválida", 409)
    const line = entry as Obj
    return { position: index + 1, quantity: str(line.quantity, `reference.lines.${index}.quantity`, 13), grossCents: cents(line.gross, `reference.lines.${index}.gross`) }
  })
  const previousRows = await tx.$queryRaw<Array<{ originalLine: number; quantity: Decimal; physicalQuantity: Decimal; amountCents: number }>>`SELECT l."originalLine",l.quantity,l."physicalQuantity",l."amountCents" FROM "FiscalAdjustmentLine" l JOIN "FiscalAdjustment" a ON a."accountId"=l."accountId" AND a.id=l."adjustmentId" WHERE a."accountId"=${actor.accountId} AND a."originalDocumentId"=${doc.id} AND a.type='E34' AND a.state IN ('VALIDADO','PREPARADO_PENDIENTE_CONEXION') AND (${excludedId ?? ""}='' OR a.id<>${excludedId ?? ""})`
  const previous: CreditUse[] = previousRows.map(row => ({ ...row, quantity: row.quantity.toString(), physicalQuantity: row.physicalQuantity.toString() }))
  let before: ReturnType<typeof creditCapacity>
  try { before = creditCapacity(originals, previous) } catch (error) { if (error instanceof CreditCapacityError) return fail("DOCUMENT_VALIDATION_FAILED", error.message, 422, error.field); throw error }
  const seen = new Set<number>()
  const reconciledLineLimits = new Map<number, number>()
  const lines = command.lines.map((selected, index) => {
    if (seen.has(selected.originalLine)) return fail("DOCUMENT_VALIDATION_FAILED", "No repitas una línea original", 422, `lines.${index}.originalLine`)
    seen.add(selected.originalLine)
    const line = sourceLines[selected.originalLine - 1] as Obj | undefined
    if (!line || !/^\d{1,10}(?:\.\d{1,2})?$/.test(selected.quantity) || new D(selected.quantity).lte(0) || !/^\d{1,10}(?:\.\d{1,2})?$/.test(selected.physicalQuantity)) return fail("DOCUMENT_VALIDATION_FAILED", "Línea o cantidad inválida", 422, `lines.${index}`)
    if (new D(selected.physicalQuantity).gt(0)) {
      // Una línea no mezcla devolución física y descuento financiero: su importe físico sería ambiguo.
      if (!new D(selected.physicalQuantity).eq(selected.quantity)) return fail("DOCUMENT_VALIDATION_FAILED", "Usa la misma cantidad física y fiscal en cada producto devuelto", 422, `lines.${index}.physicalQuantity`)
      const saleSnapshot = snapshot.sale as { commercialLines?: Array<{ saleItemId?: string; productId?: string }> } | undefined
      const commercial = saleSnapshot?.commercialLines?.[selected.originalLine - 1]
      // Envíos, propinas o líneas sin vínculo comprobable no pueden convertirse en existencias.
      if (line.kind !== "BIEN" || typeof line.productId !== "string" || !commercial?.saleItemId || commercial.productId !== line.productId) return fail("DOCUMENT_CONFLICT", "La línea no tiene un producto físico verificable en la venta original", 409, `lines.${index}.physicalQuantity`)
    }
    const originalQty = new D(str(line.quantity, "reference.quantity", 13))
    if (originalQty.lte(0)) return fail("DOCUMENT_CONFLICT", "La cantidad original es inválida", 409)
    const baseDiscount = cents(line.discount ?? "0.00", "reference.discount") + cents(line.globalDiscount ?? "0.00", "reference.globalDiscount")
    const proportionalDiscount = new D(baseDiscount).mul(selected.quantity).div(originalQty).toDecimalPlaces(0, D.ROUND_HALF_UP).toNumber()
    let discount = proportionalDiscount + selected.extraDiscountCents
    if (!Number.isSafeInteger(discount) || discount > 2147483647) return fail("DOCUMENT_VALIDATION_FAILED", "Descuento excesivo", 422, `lines.${index}`)
    const textOnly = command.modificationCode === "2"
    if (!textOnly && new D(selected.physicalQuantity).gt(0)) {
      const available = before.find(item => item.originalLine === selected.originalLine)
      if (!available || new D(available.availableQuantity).lt(selected.physicalQuantity)) return fail("DOCUMENT_VALIDATION_FAILED", "La cantidad supera la disponibilidad física", 422, `lines.${index}.physicalQuantity`)
      const physicalLimit = new D(available.availableCents).mul(selected.physicalQuantity).div(available.availableQuantity).toDecimalPlaces(0, D.ROUND_HALF_UP).toNumber()
      const price = str(line.unitPrice, `reference.lines.${index}.unitPrice`, 18)
      const grossBeforeDiscount = new D(price).mul(selected.quantity).toDecimalPlaces(2, D.ROUND_HALF_UP).mul(100)
      if (!grossBeforeDiscount.isInteger() || grossBeforeDiscount.gt(2147483647)) return fail("DOCUMENT_CONFLICT", "Importe original fuera de rango", 409, `lines.${index}`)
      const nominal = grossBeforeDiscount.toNumber() - discount
      const rates: Record<string, number> = { GRAVADO_18: 18, GRAVADO_16: 16, TASA_CERO: 0, EXENTO: 0, NO_FACTURABLE: 0 }
      const treatment = typeof line.taxTreatment === "string" ? line.taxTreatment : ""
      if (!(treatment in rates) || typeof line.priceIncludesTax !== "boolean") return fail("DOCUMENT_CONFLICT", "Tratamiento original inválido", 409, `lines.${index}`)
      const grossFor = (value: number) => line.priceIncludesTax ? value : value + new D(value).mul(rates[treatment]).div(100).toDecimalPlaces(0, D.ROUND_HALF_UP).toNumber()
      if (new D(selected.physicalQuantity).eq(available.availableQuantity)) {
        // La última unidad recupera el descuento redondeado de más en devoluciones anteriores, sin alterar el descuento extra solicitado.
        reconciledLineLimits.set(selected.originalLine, physicalLimit)
        let low = 0, high = proportionalDiscount
        while (low < high) { const middle = Math.ceil((low + high) / 2); if (grossFor(nominal + selected.extraDiscountCents + middle) <= physicalLimit) low = middle; else high = middle - 1 }
        discount -= low
      }
      const adjustedNominal = grossBeforeDiscount.toNumber() - discount
      if (adjustedNominal >= 0 && grossFor(adjustedNominal) > physicalLimit) {
        // Restar automáticamente la reducción previa; la búsqueda respeta el redondeo del ITBIS por centavo.
        let low = 0, high = adjustedNominal
        while (low < high) { const middle = Math.ceil((low + high) / 2); if (grossFor(middle) <= physicalLimit) low = middle; else high = middle - 1 }
        discount += adjustedNominal - low
      }
    }
    return { originalLine: selected.originalLine, ...(typeof line.productId === "string" ? { productId: line.productId } : {}), ...(typeof line.conceptId === "string" ? { conceptId: line.conceptId } : {}), description: textOnly && selected.description ? selected.description : line.description, kind: line.kind, unit: line.unit, quantity: selected.quantity, unitPrice: textOnly ? "0.00" : line.unitPrice, taxTreatment: line.taxTreatment, priceIncludesTax: line.priceIncludesTax, discount: textOnly ? "0.00" : money(discount) }
  })
  const calculated = await previewFiscalDocument(actor, { type: "E34", issueDate: dateToday(), expectedPolicyVersion: command.expectedPolicyVersion, issuer: party(snapshot.issuer), ...(party(snapshot.buyer) ? { buyer: party(snapshot.buyer) } : {}), reference: { documentId: doc.id, issueDate: snapshot.issueDate, modificationCode: command.modificationCode }, incomeType: snapshot.incomeType, payment: { type: "CONTADO" }, currency: { operation: "DOP", reporting: "DOP" }, lines }, tx, reconciledLineLimits)
  const proposed: CreditUse[] = calculated.lines.map((line, index) => ({ originalLine: command.lines[index].originalLine, quantity: line.quantity, physicalQuantity: command.lines[index].physicalQuantity, amountCents: cents(line.gross, `lines.${index}.gross`) }))
  try {
    const after = validateCreditUses(originals, previous, proposed, command.modificationCode)
    // El cálculo genérico no conoce reservas; aquí ya se conciliaron y no debe mostrar su advertencia obsoleta.
    const reconciled = { ...calculated, warnings: calculated.warnings.filter(warning => warning !== "La anulación total requiere que el importe de la nota coincida con el saldo pendiente; ese saldo aún no se verifica." && warning !== "El saldo pendiente y las notas anteriores aún no se verifican.") }
    return { calculated: reconciled, before, after, proposed }
  } catch (error) {
    if (error instanceof CreditCapacityError) return fail("DOCUMENT_VALIDATION_FAILED", error.message, 422, error.field)
    throw error
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}
async function command<T>(tx: Tx, actor: Actor, operationId: unknown, kind: string, input: unknown, execute: () => Promise<T>): Promise<T> {
  const id = str(operationId, "operationId")
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) return fail("INVALID_INPUT", "Identificador de operación inválido", 400, "operationId")
  const digest = createHash("sha256").update(canonical(input)).digest("hex")
  const rows = await tx.$queryRaw<Array<{ actorUserId: string; kind: string; payloadHash: string; result: T }>>`SELECT "actorUserId",kind,"payloadHash",result FROM "FiscalAdjustmentOperation" WHERE "accountId"=${actor.accountId} AND "operationId"=${id}`
  if (rows.length) {
    if (rows[0].actorUserId !== actor.id || rows[0].kind !== kind || rows[0].payloadHash !== digest) return fail("OPERATION_CONFLICT", "El identificador corresponde a otro comando", 409)
    return rows[0].result
  }
  const result = await execute()
  // El primer resultado debe coincidir con el JSON persistido: undefined desaparece al recuperar un reintento.
  const persisted = JSON.stringify(result)
  await tx.$executeRaw`INSERT INTO "FiscalAdjustmentOperation" (id,"accountId","operationId","actorUserId",kind,"payloadHash",result) VALUES (${randomUUID()},${actor.accountId},${id},${actor.id},${kind},${digest},${persisted}::jsonb)`
  return JSON.parse(persisted) as T
}
async function get(tx: Tx, actor: Actor, id: string): Promise<Adjustment> {
  const rows = await tx.$queryRaw<Adjustment[]>`SELECT * FROM "FiscalAdjustment" WHERE "accountId"=${actor.accountId} AND id=${id} AND type='E34' FOR UPDATE`
  return rows[0] ?? fail("NOT_FOUND", "Nota no encontrada", 404)
}
async function event(tx: Tx, actor: Actor, id: string, state: string, revision: number, details: unknown) {
  await tx.$executeRaw`INSERT INTO "FiscalAdjustmentEvent" (id,"accountId","adjustmentId","actorUserId",state,revision,details) VALUES (${randomUUID()},${actor.accountId},${id},${actor.id},${state},${revision},${JSON.stringify(details)}::jsonb)`
}
export async function previewCreditAdjustment(actor: Actor, raw: unknown) {
  authorize(actor)
  const input = parse(raw)
  return prisma.$transaction(async tx => { await lock(tx, actor.accountId); return calculate(tx, actor, input) })
}
export async function previewCreditAdjustmentEdit(actor: Actor, id: string, raw: unknown) {
  authorize(actor)
  const input = parse(raw)
  return prisma.$transaction(async tx => {
    await lock(tx, actor.accountId)
    const draft = await get(tx, actor, id)
    if (!["BORRADOR", "VALIDADO"].includes(draft.state) || draft.originalDocumentId !== input.originalDocumentId) return fail("VERSION_CONFLICT", "La nota ya no puede editarse", 409)
    // Excluir exclusivamente la propia reserva evita bloquear su previsualización sin liberar capacidad.
    return calculate(tx, actor, input, id)
  })
}
export async function creditAdjustmentAvailability(actor: Actor, originalDocumentId: string) {
  authorize(actor)
  const id = str(originalDocumentId, "originalDocumentId")
  return prisma.$transaction(async tx => {
    await lock(tx, actor.accountId)
    const settings = await tx.fiscalSettings.findUnique({ where: { accountId: actor.accountId } })
    if (!settings) return fail("PROFILE_UNAVAILABLE", "Configura el perfil fiscal", 409)
    await policy(tx, actor, settings.version)
    const doc = await original(tx, actor, id)
    const lines = doc.snapshot?.lines
    if (!Array.isArray(lines)) return fail("DOCUMENT_CONFLICT", "La copia original no contiene líneas", 409)
    const originals = lines.map((entry, index) => {
      const line = entry as Obj
      return { position: index + 1, quantity: str(line.quantity, `lines.${index}.quantity`, 13), grossCents: cents(line.gross, `lines.${index}.gross`) }
    })
    const rows = await tx.$queryRaw<Array<{ originalLine: number; quantity: Decimal; physicalQuantity: Decimal; amountCents: number }>>`SELECT l."originalLine",l.quantity,l."physicalQuantity",l."amountCents" FROM "FiscalAdjustmentLine" l JOIN "FiscalAdjustment" a ON a."accountId"=l."accountId" AND a.id=l."adjustmentId" WHERE a."accountId"=${actor.accountId} AND a."originalDocumentId"=${id} AND a.type='E34' AND a.state IN ('VALIDADO','PREPARADO_PENDIENTE_CONEXION')`
    const uses = rows.map(row => ({ ...row, quantity: row.quantity.toString(), physicalQuantity: row.physicalQuantity.toString() }))
    let available: CreditOriginalLine[] | ReturnType<typeof creditCapacity>
    try { available = creditCapacity(originals, uses) } catch (error) { if (error instanceof CreditCapacityError) return fail("DOCUMENT_CONFLICT", error.message, 409, error.field); throw error }
    const sale = await tx.sale.findFirst({ where: { accountId: actor.accountId, id: doc.saleId! }, select: { id: true, invoiceCode: true, customerId: true, ar: { select: { id: true, balanceCents: true, status: true } } } })
    const canViewAll = hasPermission(actor, "canViewFiscalDocuments")
    const notes = await tx.$queryRaw`SELECT id,state,revision,snapshot,"fiscalDocumentId","createdAt" FROM "FiscalAdjustment" WHERE "accountId"=${actor.accountId} AND "originalDocumentId"=${id} AND type='E34' AND (${canViewAll} OR "actorUserId"=${actor.id}) ORDER BY "createdAt" DESC,id DESC`
    const allocation = await tx.$queryRaw<Array<{ eNcf: string }>>`SELECT "eNcf" FROM "FiscalNumberAllocation" WHERE "accountId"=${actor.accountId} AND "documentId"=${id}`
    return { originalDocumentId: id, originalType: doc.type, eNcf: allocation[0]?.eNcf ?? null, originalTotals: doc.snapshot.totals ?? null, policyVersion: settings.version, sale, buyer: doc.snapshot.buyer ?? null, issueDate: doc.snapshot.issueDate, lines: lines.map((line, index) => ({ originalLine: index + 1, snapshot: line, availability: available[index] })), notes, notice: "Documentos de prueba / No emitidos fiscalmente" }
  })
}
export async function createCreditAdjustment(actor: Actor, operationId: unknown, raw: unknown) {
  authorize(actor)
  const input = parse(raw)
  return prisma.$transaction(async tx => {
    await lock(tx, actor.accountId)
    return command(tx, actor, operationId, "CREDIT_CREATE", input, async () => {
      const result = await calculate(tx, actor, input), id = randomUUID()
      await tx.$executeRaw`INSERT INTO "FiscalAdjustment" (id,"accountId","originalDocumentId",type,state,revision,"policyVersion","actorUserId",input,snapshot,"updatedAt") VALUES (${id},${actor.accountId},${input.originalDocumentId},'E34','BORRADOR',1,${input.expectedPolicyVersion},${actor.id},${JSON.stringify(input)}::jsonb,${JSON.stringify(result.calculated)}::jsonb,now())`
      await event(tx, actor, id, "BORRADOR", 1, { action: "CREATED", input })
      return { id, type: "E34", state: "BORRADOR", revision: 1, preview: result }
    })
  })
}
export async function updateCreditAdjustment(actor: Actor, id: string, operationId: unknown, expectedRevision: unknown, raw: unknown) {
  authorize(actor)
  const input = parse(raw)
  return prisma.$transaction(async tx => {
    await lock(tx, actor.accountId)
    return command(tx, actor, operationId, "CREDIT_UPDATE", { id, expectedRevision, input }, async () => {
      const draft = await get(tx, actor, id)
      if (!["BORRADOR", "VALIDADO"].includes(draft.state) || draft.revision !== expectedRevision || draft.originalDocumentId !== input.originalDocumentId) return fail("VERSION_CONFLICT", "La nota cambió o no puede editarse", 409)
      const result = await calculate(tx, actor, input, id), revision = draft.revision + 1
      // Al editar se sustituye la reserva completa bajo el mismo candado; nunca quedan líneas antiguas activas.
      await tx.$executeRaw`DELETE FROM "FiscalAdjustmentLine" WHERE "accountId"=${actor.accountId} AND "adjustmentId"=${id}`
      const state = draft.state === "VALIDADO" ? "VALIDADO" : "BORRADOR"
      if (state === "VALIDADO") for (const line of result.proposed) await tx.$executeRaw`INSERT INTO "FiscalAdjustmentLine" (id,"accountId","adjustmentId","originalLine",quantity,"physicalQuantity","amountCents") VALUES (${randomUUID()},${actor.accountId},${id},${line.originalLine},${new D(line.quantity)},${new D(line.physicalQuantity)},${line.amountCents})`
      // Una reserva editada sigue reservada dentro de la misma transacción; no abrir una ventana para otras notas.
      await tx.$executeRaw`UPDATE "FiscalAdjustment" SET state=${state},revision=${revision},"policyVersion"=${input.expectedPolicyVersion},input=${JSON.stringify(input)}::jsonb,snapshot=${JSON.stringify(result.calculated)}::jsonb,"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${id}`
      await event(tx, actor, id, state, revision, { action: state === "VALIDADO" ? "RESERVATION_REPLACED" : "UPDATED", input, ...(state === "VALIDADO" ? { lines: result.proposed } : {}) })
      return { id, type: "E34", state, revision, preview: result }
    })
  })
}
export async function validateCreditAdjustment(actor: Actor, id: string, operationId: unknown, expectedRevision: unknown) {
  authorize(actor)
  return prisma.$transaction(async tx => {
    await lock(tx, actor.accountId)
    return command(tx, actor, operationId, "CREDIT_VALIDATE", { id, expectedRevision }, async () => {
      const draft = await get(tx, actor, id)
      if (draft.state !== "BORRADOR" || draft.revision !== expectedRevision) return fail("VERSION_CONFLICT", "La nota cambió o ya no es un borrador", 409)
      const result = await calculate(tx, actor, parse(draft.input), id)
      for (const line of result.proposed) await tx.$executeRaw`INSERT INTO "FiscalAdjustmentLine" (id,"accountId","adjustmentId","originalLine",quantity,"physicalQuantity","amountCents") VALUES (${randomUUID()},${actor.accountId},${id},${line.originalLine},${new D(line.quantity)},${new D(line.physicalQuantity)},${line.amountCents})`
      await tx.$executeRaw`UPDATE "FiscalAdjustment" SET state='VALIDADO',snapshot=${JSON.stringify(result.calculated)}::jsonb,"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${id}`
      await event(tx, actor, id, "VALIDADO", draft.revision, { action: "RESERVED", lines: result.proposed })
      return { id, type: "E34", state: "VALIDADO", revision: draft.revision, preview: result }
    })
  })
}
export async function discardCreditAdjustment(actor: Actor, id: string, operationId: unknown, expectedRevision: unknown, reason: unknown) {
  authorize(actor)
  const why = str(reason, "reason", 500)
  return prisma.$transaction(async tx => {
    await lock(tx, actor.accountId)
    return command(tx, actor, operationId, "CREDIT_DISCARD", { id, expectedRevision, reason: why }, async () => {
      const draft = await get(tx, actor, id)
      if (!["BORRADOR", "VALIDADO"].includes(draft.state) || draft.revision !== expectedRevision) return fail("VERSION_CONFLICT", "La nota cambió o ya está protegida", 409)
      // Descartar un borrador no crea efectos fiscales: debe seguir siendo posible tras apagar el perfil.
      await tx.$executeRaw`UPDATE "FiscalAdjustment" SET state='DESCARTADO',"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${id}`
      await event(tx, actor, id, "DESCARTADO", draft.revision, { action: "DISCARDED", reason: why })
      return { id, type: "E34", state: "DESCARTADO", revision: draft.revision }
    })
  })
}

export async function listCreditAdjustments(actor: Actor, originalDocumentId?: string, page: { skip?: number; take?: number } = {}) {
  authorize(actor, true)
  const original = originalDocumentId?.trim() || ""
  const canViewAll = hasPermission(actor, "canViewFiscalDocuments")
  const skip = page.skip ?? 0, take = page.take ?? 100
  if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(take) || take < 1 || take > 100) return fail("INVALID_INPUT", "Paginación inválida", 400)
  // No ocultar notas históricas cuando la empresa supera la primera página.
  const rows = await prisma.$queryRaw<Adjustment[]>`SELECT * FROM "FiscalAdjustment" WHERE "accountId"=${actor.accountId} AND type='E34' AND (${canViewAll} OR "actorUserId"=${actor.id}) AND (${original}='' OR "originalDocumentId"=${original}) ORDER BY "createdAt" DESC,id DESC LIMIT ${take + 1} OFFSET ${skip}`
  return { data: rows.slice(0, take), nextSkip: rows.length > take ? skip + take : null, notice: "Documentos de prueba / No emitidos fiscalmente." }
}

export async function getCreditAdjustment(actor: Actor, id: string) {
  authorize(actor, true)
  const rows = await prisma.$queryRaw<Adjustment[]>`SELECT * FROM "FiscalAdjustment" WHERE "accountId"=${actor.accountId} AND id=${id} AND type='E34'`
  if (!rows.length || (!hasPermission(actor, "canViewFiscalDocuments") && rows[0].actorUserId !== actor.id)) return fail("NOT_FOUND", "Nota no encontrada", 404)
  const events = await prisma.$queryRaw`SELECT state,revision,"actorUserId",details,"createdAt" FROM "FiscalAdjustmentEvent" WHERE "accountId"=${actor.accountId} AND "adjustmentId"=${id} ORDER BY "createdAt",id`
  return { ...rows[0], events, notice: "Documento de prueba / No emitido fiscalmente." }
}

type CreditSettlement = { kind: "REFUND" | "CUSTOMER_CREDIT" | "NONE"; method?: PaymentMethod; treasuryAccountId?: string }
type AdjustmentApplicationDelegate = { create(args: { data: { accountId: string; adjustmentId: string; kind: string; amountCents: number; userId: string; receivableId?: string; treasuryAccountId?: string; method?: PaymentMethod } }): Promise<{ id: string }> }

/** Confirma la reserva, su copia fiscal y sus efectos como una única operación de caja. */
export async function confirmCreditAdjustment(actor: Actor, id: string, raw: unknown) {
  authorize(actor)
  const body = object(raw, "body", ["expectedRevision", "settlement", "cashOperation"])
  if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 1) return fail("INVALID_INPUT", "Revisión inválida", 400, "expectedRevision")
  const settlementInput = object(body.settlement, "settlement", ["kind", "method", "treasuryAccountId"])
  const kind = str(settlementInput.kind, "settlement.kind", 20)
  if (!["REFUND", "CUSTOMER_CREDIT", "NONE"].includes(kind)) return fail("INVALID_INPUT", "Destino del crédito inválido", 400, "settlement.kind")
  const settlement: CreditSettlement = { kind: kind as CreditSettlement["kind"] }
  if (kind === "REFUND") {
    const method = str(settlementInput.method, "settlement.method", 20)
    if (!["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"].includes(method)) return fail("INVALID_INPUT", "Método de reembolso inválido", 400, "settlement.method")
    settlement.method = method as PaymentMethod
    settlement.treasuryAccountId = str(settlementInput.treasuryAccountId, "settlement.treasuryAccountId")
  } else if (settlementInput.method !== undefined || settlementInput.treasuryAccountId !== undefined) return fail("INVALID_INPUT", "El destino no admite cuenta ni método de reembolso", 400, "settlement")
  const operation = object(body.cashOperation, "cashOperation", ["accountId", "userId", "clientOperationId", "cashShiftId", "clientSequence", "fiscalPolicyVersion"]) as unknown as CashOperationInput
  // El identificador debe poder recuperarse por la API fiscal y la versión debe formar parte del reintento.
  if (typeof operation.clientOperationId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(operation.clientOperationId) || !Number.isSafeInteger(operation.fiscalPolicyVersion) || (operation.fiscalPolicyVersion as number) < 1) return fail("INVALID_INPUT", "Indica un identificador y una versión fiscal válidos", 400, "cashOperation")
  const payload = { kind: "confirmCreditAdjustment", adjustmentId: id, expectedRevision: body.expectedRevision, settlement }
  return cashRequest.run({ ...cashRequest.getStore(), fiscalAdjustmentRequested: true }, () => withCashOperation(operation, payload, () => prisma.$transaction(async tx => {
    await lock(tx, actor.accountId)
    const draft = await get(tx, actor, id)
    if (draft.state !== "VALIDADO" || draft.revision !== body.expectedRevision) return fail("VERSION_CONFLICT", "La nota no está validada o cambió; vuelve a revisarla", 409)
    if (operation.fiscalPolicyVersion !== draft.policyVersion) return fail("VERSION_CONFLICT", "La versión de caja no coincide con la nota", 409, "cashOperation.fiscalPolicyVersion")
    const input = parse(draft.input)
    // La cola offline solo transporta devoluciones físicas previamente revisadas; una nota financiera requiere conexión.
    if (cashRequest.getStore()?.fiscalPhysicalOnlyQueued && !input.lines.some(line => new D(line.physicalQuantity).gt(0))) return fail("DOCUMENT_CONFLICT", "Las notas financieras requieren conexión", 409)
    if (cashRequest.getStore()?.fiscalFinancialOnlyQueued && input.lines.some(line => new D(line.physicalQuantity).gt(0))) return fail("DOCUMENT_CONFLICT", "Usa la operación de devolución física para reponer inventario", 409)
    const result = await calculate(tx, actor, input, id)
    // La fecha, la política o el cálculo pueden cambiar desde la reserva; exigir una nueva revisión.
    if (canonical(JSON.parse(JSON.stringify(result.calculated))) !== canonical(draft.snapshot)) return fail("DOCUMENT_CONFLICT", "El cálculo cambió desde la validación; edita y vuelve a validar", 409)
    const originalDocument = await original(tx, actor, draft.originalDocumentId)
    if (!originalDocument.saleId) return fail("DOCUMENT_CONFLICT", "Falta la venta original", 409)
    const sale = await tx.sale.findFirst({ where: { id: originalDocument.saleId, accountId: actor.accountId }, include: { customer: true, ar: true, items: { include: { consumptions: true } } } })
    if (!sale || sale.cancelledAt) return fail("DOCUMENT_CONFLICT", "La venta original no está disponible", 409)
    if (sale.type === "CREDITO" && !sale.ar) return fail("DOCUMENT_CONFLICT", "La venta a crédito no tiene cuenta por cobrar", 409)
    if (sale.ar) await tx.$queryRaw`SELECT id FROM "AccountReceivable" WHERE id=${sale.ar.id} FOR UPDATE`
    const economicCents = cents(result.calculated.totals.net, "totals.net")
    const debtCents = Math.min(sale.ar?.balanceCents ?? 0, economicCents)
    const excessCents = economicCents - debtCents
    if (excessCents > 0 && settlement.kind === "NONE") return fail("DOCUMENT_VALIDATION_FAILED", "Elige reembolso o saldo a favor para el excedente", 422, "settlement.kind")
    if (excessCents === 0 && settlement.kind !== "NONE") return fail("DOCUMENT_VALIDATION_FAILED", "No hay excedente para reembolsar o conservar", 422, "settlement.kind")
    if (settlement.kind === "CUSTOMER_CREDIT") {
      // Un saldo a favor no puede asignarse al cliente genérico ni a otra identidad distinta de la copia.
      if (!sale.customer || sale.customer.isGeneric || !result.calculated.buyer?.id || result.calculated.buyer.id !== sale.customer.id) return fail("DOCUMENT_VALIDATION_FAILED", "El saldo a favor requiere el cliente identificado de la factura original", 422, "settlement.kind")
    }
    if (settlement.kind === "REFUND") {
      const treasury = await requireTreasuryAccount(tx, { accountId: actor.accountId, treasuryAccountId: settlement.treasuryAccountId!, requireActive: true, message: "La cuenta de reembolso no existe o está inactiva" })
      if (treasury.currency !== "DOP") return fail("DOCUMENT_VALIDATION_FAILED", "La cuenta de reembolso debe estar en DOP", 422, "settlement.treasuryAccountId")
    }
    const scope = cashRequest.getStore()
    if (!scope || scope.trustedActor?.id !== actor.id || scope.trustedActor.accountId !== actor.accountId) return fail("FORBIDDEN", "La identidad de caja no coincide", 403)
    // La excepción se abre después de validar la reserva y solo para esta transacción.
    scope.fiscalAdjustmentAuthorizedAccountId = actor.accountId
    const application = (tx as unknown as { fiscalAdjustmentApplication: AdjustmentApplicationDelegate }).fiscalAdjustmentApplication
    if (!application) return fail("DOCUMENT_CONFLICT", "Actualiza el cliente de base de datos antes de confirmar notas", 409)
    if (debtCents && sale.ar) {
      const newBalance = sale.ar.balanceCents - debtCents
      const updated = await tx.accountReceivable.updateMany({ where: { id: sale.ar.id, sale: { accountId: actor.accountId }, balanceCents: sale.ar.balanceCents }, data: { balanceCents: newBalance, status: newBalance === 0 ? "PAGADA" : "PARCIAL" } })
      if (updated.count !== 1) return fail("VERSION_CONFLICT", "El saldo cambió; vuelve a revisar la nota", 409)
      await application.create({ data: { accountId: actor.accountId, adjustmentId: id, kind: "DEBT", amountCents: debtCents, receivableId: sale.ar.id, userId: actor.id } })
    }
    let creditId: string | null = null
    if (excessCents && settlement.kind === "CUSTOMER_CREDIT") {
      await application.create({ data: { accountId: actor.accountId, adjustmentId: id, kind: "CUSTOMER_CREDIT", amountCents: excessCents, userId: actor.id } })
      creditId = randomUUID()
      await tx.$executeRaw`INSERT INTO "FiscalCustomerCredit" (id,"accountId","adjustmentId","customerId","originalCents","balanceCents","updatedAt") VALUES (${creditId},${actor.accountId},${id},${sale.customerId},${excessCents},${excessCents},now())`
    } else if (excessCents && settlement.kind === "REFUND") {
      await application.create({ data: { accountId: actor.accountId, adjustmentId: id, kind: "REFUND", amountCents: excessCents, treasuryAccountId: settlement.treasuryAccountId, method: settlement.method, userId: actor.id } })
    }

    const saleMeta = originalDocument.snapshot.sale as { commercialLines?: Array<{ saleItemId?: string; productId?: string }> } | undefined
    const physical = result.calculated.lines.flatMap((line, index) => {
      if (new D(input.lines[index].physicalQuantity).isZero()) return []
      const commercial = saleMeta?.commercialLines?.[input.lines[index].originalLine - 1]
      const item = sale.items.find(candidate => candidate.id === commercial?.saleItemId && candidate.productId === line.productId)
      if (!item || !commercial || commercial.productId !== item.productId || new D(input.lines[index].physicalQuantity).gt(item.qty.toString())) return fail("DOCUMENT_CONFLICT", "El producto físico no coincide con la venta conservada", 409)
      return [{ line, item, quantity: input.lines[index].physicalQuantity }]
    })
    if (new Set(physical.map(entry => entry.item.id)).size !== physical.length) return fail("DOCUMENT_CONFLICT", "La copia repite un artículo de venta físico", 409)
    let returnId: string | null = null
    if (physical.length) {
      const previousPhysical = await tx.$queryRaw<Array<{ saleItemId: string; qty: Decimal; fiscalRestorations: unknown }>>`SELECT ri."saleItemId",ri.qty,ri."fiscalRestorations" FROM "ReturnItem" ri JOIN "Return" r ON r.id=ri."returnId" WHERE r."accountId"=${actor.accountId} AND r."saleId"=${sale.id} AND r."cancelledAt" IS NULL`
      const restorations = physical.map(({ item, quantity }) => {
        const prior = previousPhysical.filter(entry => entry.saleItemId === item.id)
        const priorQty = prior.reduce((sum, entry) => sum.plus(entry.qty.toString()), new D(0))
        const source = new Map<string, InstanceType<typeof D>>()
        for (const consumption of item.consumptions) source.set(consumption.ingredientId, (source.get(consumption.ingredientId) ?? new D(0)).plus(consumption.qty.toString()))
        for (const entry of prior) {
          if (entry.fiscalRestorations === null) continue
          if (!Array.isArray(entry.fiscalRestorations) || entry.fiscalRestorations.length !== source.size || entry.fiscalRestorations.some((value: unknown) => !value || typeof value !== "object" || typeof (value as { ingredientId?: unknown }).ingredientId !== "string" || !source.has((value as { ingredientId: string }).ingredientId))) return fail("DOCUMENT_CONFLICT", "La reposición anterior requiere conciliación", 409)
        }
        return [...source].map(([ingredientId, originalQty]) => {
          const restoredBefore = prior.reduce((sum, entry) => {
            if (entry.fiscalRestorations === null) {
              // Compatibilidad con devoluciones anteriores que redondeaban cada consumo por separado.
              return item.consumptions.filter(consumption => consumption.ingredientId === ingredientId).reduce((subtotal, consumption) => subtotal.plus(new D(consumption.qty.toString()).mul(entry.qty.toString()).div(item.qty.toString()).toDecimalPlaces(3, D.ROUND_HALF_UP)), sum)
            }
            if (!Array.isArray(entry.fiscalRestorations)) return fail("DOCUMENT_CONFLICT", "La reposición anterior requiere conciliación", 409)
            const matches = entry.fiscalRestorations.filter((value: unknown) => value && typeof value === "object" && (value as { ingredientId?: unknown }).ingredientId === ingredientId) as Array<{ quantity?: unknown }>
            if (matches.length !== 1 || typeof matches[0].quantity !== "string" || !/^\d{1,10}\.\d{3}$/.test(matches[0].quantity)) return fail("DOCUMENT_CONFLICT", "La reposición anterior requiere conciliación", 409)
            return sum.plus(matches[0].quantity)
          }, new D(0))
          // Repartir el resto acumulado permite que la última devolución alcance el consumo original exacto.
          const target = originalQty.mul(priorQty.plus(quantity)).div(item.qty.toString()).toDecimalPlaces(3, D.ROUND_HALF_UP)
          const delta = target.minus(restoredBefore)
          if (delta.lt(0) || delta.gt(originalQty)) return fail("DOCUMENT_CONFLICT", "El inventario devuelto requiere conciliación", 409)
          return { ingredientId, quantity: delta.toFixed(3) }
        })
      })
      const seq = await tx.returnSequence.upsert({ where: { accountId: actor.accountId }, update: { lastNumber: { increment: 1 } }, create: { accountId: actor.accountId, lastNumber: 1 } })
      const returnSubtotal = physical.reduce((sum, item) => sum + cents(item.line.base, "lines.base"), 0)
      const returnTax = physical.reduce((sum, item) => sum + cents(item.line.tax, "lines.tax") - cents(item.line.taxNotCreditable, "lines.taxNotCreditable"), 0)
      const returnTotal = physical.reduce((sum, item) => sum + cents(item.line.gross, "lines.gross") - cents(item.line.taxNotCreditable, "lines.taxNotCreditable") - item.line.withholdings.reduce((part, withholding) => part + cents(withholding.amount, "lines.withholdings"), 0), 0)
      const created = await tx.return.create({ data: {
        accountId: actor.accountId, fiscalAdjustmentId: id, returnNumber: seq.lastNumber, returnCode: `DEV-${String(seq.lastNumber).padStart(5, "0")}`,
        saleId: sale.id, userId: actor.id, refundMethod: null, refundTreasuryAccountId: null,
        subtotalCents: returnSubtotal, itbisCents: returnTax, totalCents: returnTotal,
        discountPercentBp: sale.discountPercentBp, salePricesIncludeItbis: sale.salePricesIncludeItbis, notes: input.reason,
        items: { create: physical.map(({ item, quantity }, index) => ({ saleItemId: item.id, productId: item.productId, qty: new D(quantity), unitPriceCents: item.unitPriceCents, itbisRateBp: item.itbisRateBp, lineTotalCents: new D(item.unitPriceCents).mul(quantity).toDecimalPlaces(0, D.ROUND_HALF_UP).toNumber(), fiscalRestorations: restorations[index] })) },
      } as never, select: { id: true } })
      returnId = created.id
      // Mantener la auditoría comercial de devoluciones, además del historial inmutable de la nota.
      await logAuditEvent({ accountId: actor.accountId, userId: actor.id, userEmail: actor.email ?? null, userUsername: actor.username ?? null, action: "RETURN_CREATED", resourceType: "Return", resourceId: returnId, details: { returnCode: `DEV-${String(seq.lastNumber).padStart(5, "0")}`, saleId: sale.id, fiscalAdjustmentId: id, physicalOnly: true, totalCents: returnTotal, itemsCount: physical.length, reason: input.reason } }, tx)
      for (const row of restorations) for (const consumption of row) {
        // Reponer exactamente las cantidades guardadas, incluidos ingredientes de recetas, una sola vez.
        const changed = await tx.product.updateMany({ where: { id: consumption.ingredientId, accountId: actor.accountId }, data: { stock: { increment: new D(consumption.quantity) } } })
        if (changed.count !== 1) return fail("DOCUMENT_CONFLICT", "El inventario original no pertenece a la empresa", 409)
      }
    }

    const documentId = randomUUID()
    const snapshot = { ...result.calculated, source: { kind: "ADJUSTMENT", id }, adjustment: { originalDocumentId: draft.originalDocumentId, reason: input.reason, economicCents, debtCents, excessCents, settlement: settlement.kind, returnId, creditId } }
    await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","adjustmentId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES (${documentId},${actor.accountId},${id},'E34','BORRADOR',${result.calculated.policyVersion},${result.calculated.ruleVersion},${JSON.stringify(snapshot)}::jsonb,now())`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentRevision" (id,"accountId","documentId",revision,"actorUserId",input) VALUES (${randomUUID()},${actor.accountId},${documentId},1,${actor.id},${JSON.stringify(input)}::jsonb)`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentEvent" (id,"accountId","documentId","actorUserId",state,details) VALUES (${randomUUID()},${actor.accountId},${documentId},${actor.id},'BORRADOR',${JSON.stringify({ adjustmentId: id })}::jsonb)`
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO',"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${documentId}`
    for (const [index, line] of result.calculated.lines.entries()) await tx.$executeRaw`INSERT INTO "FiscalDocumentLine" (id,"accountId","documentId",position,snapshot) VALUES (${randomUUID()},${actor.accountId},${documentId},${index + 1},${JSON.stringify(line)}::jsonb)`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentReference" (id,"accountId","documentId","referencedDocumentId",snapshot) VALUES (${randomUUID()},${actor.accountId},${documentId},${draft.originalDocumentId},${JSON.stringify(result.calculated.reference)}::jsonb)`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentEvent" (id,"accountId","documentId","actorUserId",state,details) VALUES (${randomUUID()},${actor.accountId},${documentId},${actor.id},'VALIDADO',${JSON.stringify({ adjustmentId: id })}::jsonb)`
    const allocation = await reserveFiscalNumber(tx, actor, documentId, "E34")
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION',"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${documentId}`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentEvent" (id,"accountId","documentId","actorUserId",state,details) VALUES (${randomUUID()},${actor.accountId},${documentId},${actor.id},'PREPARADO_PENDIENTE_CONEXION',${JSON.stringify({ adjustmentId: id, eNcf: allocation.eNcf })}::jsonb)`
    await tx.$executeRaw`UPDATE "FiscalAdjustment" SET state='PREPARADO_PENDIENTE_CONEXION',"fiscalDocumentId"=${documentId},snapshot=${JSON.stringify(snapshot)}::jsonb,"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${id}`
    await event(tx, actor, id, "PREPARADO_PENDIENTE_CONEXION", draft.revision, { documentId, eNcf: allocation.eNcf, economicCents, debtCents, excessCents, returnId, creditId })
    return { id, revision: draft.revision, state: "PREPARADO_PENDIENTE_CONEXION", documentId, eNcf: allocation.eNcf, economicCents, debtCents, excessCents, returnId, creditId, notice: "Documento de prueba / No emitido fiscalmente" }
  }, TRANSACTION_OPTIONS)))
}
