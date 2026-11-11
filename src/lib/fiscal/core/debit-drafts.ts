import { randomUUID } from "node:crypto"
import { Decimal } from "@prisma/client/runtime/library"
import { PaymentMethod, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { cashRequest, withCashOperation, type CashOperationInput } from "@/lib/cash-context"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { getTransferBankNameFromTreasuryAccount, requireTreasuryAccount } from "@/lib/treasury"
import { logAuditEvent } from "@/lib/audit-log"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { FiscalDocumentError } from "./document"
import { previewFiscalDocument } from "./preview"
import { reserveFiscalNumber } from "./sequences"
import { lockFiscalAdjustmentAccount, requireFiscalAdjustmentPolicy, getFiscalAdjustmentOriginal, runFiscalAdjustmentCommand, recordFiscalAdjustmentEvent, fiscalAdjustmentToday, fiscalAdjustmentParty, canonicalFiscalAdjustment } from "./credit-drafts"

type Actor = PermissionAwareUser & { id: string; accountId: string }
type Tx = Prisma.TransactionClient
type Obj = Record<string, unknown>
type DebitLine = { description: string; kind: "SERVICIO" | "RECARGO"; unit: string; quantity: string; unitPrice: string; taxTreatment: string; priceIncludesTax: boolean; discount?: string; conceptId?: string }
type DebitCommand = { originalDocumentId: string; expectedPolicyVersion: number; issueDate?: string; reason: string; payment: { type: "CONTADO" | "CREDITO"; dueDate?: string }; lines: DebitLine[] }
type DebitDraft = { id: string; accountId: string; originalDocumentId: string; actorUserId: string; fiscalDocumentId: string | null; state: string; revision: number; policyVersion: number; input: DebitCommand; snapshot: unknown }
const fail = (code: string, message: string, status = 422, field?: string): never => { throw new FiscalDocumentError(code, message, status, field ? [{ field, message }] : []) }
function object(value: unknown, field: string, allowed: string[]): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("INVALID_INPUT", "Se esperaba un objeto", 400, field)
  const result = value as Obj, extra = Object.keys(result).find(key => !allowed.includes(key))
  if (extra) return fail("INVALID_INPUT", `Campo no admitido: ${extra}`, 400, `${field}.${extra}`)
  return result
}
function text(value: unknown, field: string, max = 100) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) return fail("INVALID_INPUT", "Dato obligatorio o inválido", 400, field)
  return value.trim()
}
function authorize(actor: Actor, view = false) {
  const fiscal = view ? hasPermission(actor, "canViewFiscalDocuments") || hasPermission(actor, "canPrepareFiscalDocuments") : hasPermission(actor, "canPrepareFiscalDocuments")
  if (!fiscal || !hasPermission(actor, "canAccessSales") || !hasPermission(actor, "canAccessAccountsReceivable")) fail("FORBIDDEN", "Sin permiso para gestionar notas de débito", 403)
}
function parse(raw: unknown): DebitCommand {
  const body = object(raw, "body", ["originalDocumentId", "expectedPolicyVersion", "issueDate", "reason", "payment", "lines"])
  if (!Number.isSafeInteger(body.expectedPolicyVersion) || (body.expectedPolicyVersion as number) < 1) return fail("INVALID_INPUT", "Versión fiscal inválida", 400, "expectedPolicyVersion")
  const payment = object(body.payment, "payment", ["type", "dueDate"]), paymentType = text(payment.type, "payment.type", 10)
  if (!["CONTADO", "CREDITO"].includes(paymentType)) return fail("INVALID_INPUT", "Tipo de pago inválido", 400, "payment.type")
  if (paymentType === "CONTADO" && payment.dueDate !== undefined) return fail("INVALID_INPUT", "El contado no tiene vencimiento de deuda", 400, "payment.dueDate")
  const dueDate = paymentType === "CREDITO" ? text(payment.dueDate, "payment.dueDate", 10) : undefined
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100) return fail("INVALID_INPUT", "Indica entre una y cien líneas", 400, "lines")
  const lines = body.lines.map((item, index): DebitLine => {
    const value = object(item, `lines.${index}`, ["description", "kind", "unit", "quantity", "unitPrice", "taxTreatment", "priceIncludesTax", "discount", "conceptId"])
    const kind = text(value.kind, `lines.${index}.kind`, 10)
    if (!["SERVICIO", "RECARGO"].includes(kind)) return fail("INVALID_INPUT", "Los cargos monetarios solo admiten servicios o recargos", 400, `lines.${index}.kind`)
    if (typeof value.priceIncludesTax !== "boolean") return fail("INVALID_INPUT", "Indica si el precio incluye ITBIS", 400, `lines.${index}.priceIncludesTax`)
    return { description: text(value.description, `lines.${index}.description`, 200), kind: kind as DebitLine["kind"], unit: text(value.unit, `lines.${index}.unit`, 30), quantity: text(value.quantity, `lines.${index}.quantity`, 16), unitPrice: text(value.unitPrice, `lines.${index}.unitPrice`, 18), taxTreatment: text(value.taxTreatment, `lines.${index}.taxTreatment`, 20), priceIncludesTax: value.priceIncludesTax, ...(value.discount === undefined ? {} : { discount: text(value.discount, `lines.${index}.discount`, 18) }), ...(value.conceptId === undefined ? {} : { conceptId: text(value.conceptId, `lines.${index}.conceptId`) }) }
  })
  return { originalDocumentId: text(body.originalDocumentId, "originalDocumentId"), expectedPolicyVersion: body.expectedPolicyVersion as number, ...(body.issueDate === undefined ? {} : { issueDate: text(body.issueDate, "issueDate", 10) }), reason: text(body.reason, "reason", 500), payment: { type: paymentType as "CONTADO" | "CREDITO", ...(dueDate ? { dueDate } : {}) }, lines }
}
async function calculate(tx: Tx, actor: Actor, input: DebitCommand) {
  await requireFiscalAdjustmentPolicy(tx, actor, input.expectedPolicyVersion)
  const original = await getFiscalAdjustmentOriginal(tx, actor, input.originalDocumentId, false)
  const snapshot = original.snapshot, currency = snapshot.currency as Obj | undefined
  if (currency?.operation !== "DOP" || typeof snapshot.issueDate !== "string" || !fiscalAdjustmentParty(snapshot.issuer)) return fail("DOCUMENT_CONFLICT", "La copia original no permite preparar el cargo", 409)
  const doc = await previewFiscalDocument(actor, { type: "E33", issueDate: input.issueDate ?? fiscalAdjustmentToday(), expectedPolicyVersion: input.expectedPolicyVersion, issuer: fiscalAdjustmentParty(snapshot.issuer), ...(fiscalAdjustmentParty(snapshot.buyer) ? { buyer: fiscalAdjustmentParty(snapshot.buyer) } : {}), reference: { documentId: original.id, issueDate: snapshot.issueDate, modificationCode: "3" }, incomeType: snapshot.incomeType, payment: input.payment, currency: { operation: "DOP", reporting: "DOP" }, lines: input.lines }, tx)
  if (new Decimal(doc.totals.gross).lte(0)) return fail("DOCUMENT_VALIDATION_FAILED", "El cargo debe tener un importe positivo", 422, "lines")
  return { calculated: doc, original }
}
async function get(tx: Tx, actor: Actor, id: string) {
  const rows = await tx.$queryRaw<DebitDraft[]>`SELECT * FROM "FiscalAdjustment" WHERE "accountId"=${actor.accountId} AND id=${id} AND type='E33' FOR UPDATE`
  return rows[0] ?? fail("NOT_FOUND", "Nota de débito no encontrada", 404)
}
export async function previewDebitAdjustment(actor: Actor, raw: unknown) {
  authorize(actor); const input = parse(raw)
  return prisma.$transaction(async tx => { await lockFiscalAdjustmentAccount(tx, actor.accountId); const result = await calculate(tx, actor, input); return { calculated: result.calculated } })
}
export async function createDebitAdjustment(actor: Actor, operationId: unknown, raw: unknown) {
  authorize(actor); const input = parse(raw)
  return prisma.$transaction(async tx => { await lockFiscalAdjustmentAccount(tx, actor.accountId); return runFiscalAdjustmentCommand(tx, actor, operationId, "DEBIT_CREATE", input, async () => {
    const result = await calculate(tx, actor, input), id = randomUUID()
    await tx.$executeRaw`INSERT INTO "FiscalAdjustment" (id,"accountId","originalDocumentId",type,state,revision,"policyVersion","actorUserId",input,snapshot,"updatedAt") VALUES (${id},${actor.accountId},${input.originalDocumentId},'E33','BORRADOR',1,${input.expectedPolicyVersion},${actor.id},${JSON.stringify(input)}::jsonb,${JSON.stringify(result.calculated)}::jsonb,now())`
    await recordFiscalAdjustmentEvent(tx, actor, id, "BORRADOR", 1, { action: "CREATED", input })
    return { id, type: "E33", state: "BORRADOR", revision: 1, preview: { calculated: result.calculated } }
  }) })
}
export async function updateDebitAdjustment(actor: Actor, id: string, operationId: unknown, expectedRevision: unknown, raw: unknown) {
  authorize(actor); const input = parse(raw)
  return prisma.$transaction(async tx => { await lockFiscalAdjustmentAccount(tx, actor.accountId); return runFiscalAdjustmentCommand(tx, actor, operationId, "DEBIT_UPDATE", { id, expectedRevision, input }, async () => {
    const draft = await get(tx, actor, id)
    if (!["BORRADOR", "VALIDADO"].includes(draft.state) || draft.revision !== expectedRevision || draft.originalDocumentId !== input.originalDocumentId) return fail("VERSION_CONFLICT", "La nota cambió o no puede editarse", 409)
    const result = await calculate(tx, actor, input), revision = draft.revision + 1
    await tx.$executeRaw`UPDATE "FiscalAdjustment" SET state='BORRADOR',revision=${revision},"policyVersion"=${input.expectedPolicyVersion},input=${JSON.stringify(input)}::jsonb,snapshot=${JSON.stringify(result.calculated)}::jsonb,"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${id}`
    await recordFiscalAdjustmentEvent(tx, actor, id, "BORRADOR", revision, { action: "UPDATED", input })
    return { id, type: "E33", state: "BORRADOR", revision, preview: { calculated: result.calculated } }
  }) })
}
export async function validateDebitAdjustment(actor: Actor, id: string, operationId: unknown, expectedRevision: unknown) {
  authorize(actor)
  return prisma.$transaction(async tx => { await lockFiscalAdjustmentAccount(tx, actor.accountId); return runFiscalAdjustmentCommand(tx, actor, operationId, "DEBIT_VALIDATE", { id, expectedRevision }, async () => {
    const draft = await get(tx, actor, id)
    if (draft.state !== "BORRADOR" || draft.revision !== expectedRevision) return fail("VERSION_CONFLICT", "La nota cambió o no es un borrador", 409)
    const result = await calculate(tx, actor, parse(draft.input))
    await tx.$executeRaw`UPDATE "FiscalAdjustment" SET state='VALIDADO',snapshot=${JSON.stringify(result.calculated)}::jsonb,"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${id}`
    await recordFiscalAdjustmentEvent(tx, actor, id, "VALIDADO", draft.revision, { action: "VALIDATED" })
    return { id, type: "E33", state: "VALIDADO", revision: draft.revision, preview: { calculated: result.calculated } }
  }) })
}
export async function discardDebitAdjustment(actor: Actor, id: string, operationId: unknown, expectedRevision: unknown, reason: unknown) {
  authorize(actor); const why = text(reason, "reason", 500)
  return prisma.$transaction(async tx => { await lockFiscalAdjustmentAccount(tx, actor.accountId); return runFiscalAdjustmentCommand(tx, actor, operationId, "DEBIT_DISCARD", { id, expectedRevision, reason: why }, async () => {
    const draft = await get(tx, actor, id)
    if (!["BORRADOR", "VALIDADO"].includes(draft.state) || draft.revision !== expectedRevision) return fail("VERSION_CONFLICT", "La nota cambió o ya está protegida", 409)
    await tx.$executeRaw`UPDATE "FiscalAdjustment" SET state='DESCARTADO',"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${id}`
    await recordFiscalAdjustmentEvent(tx, actor, id, "DESCARTADO", draft.revision, { action: "DISCARDED", reason: why })
    return { id, type: "E33", state: "DESCARTADO", revision: draft.revision }
  }) })
}
export async function listDebitAdjustments(actor: Actor, originalDocumentId?: string, page: { skip?: number; take?: number } = {}) {
  authorize(actor, true); const id = originalDocumentId?.trim() ?? "", canViewAll = hasPermission(actor, "canViewFiscalDocuments")
  const skip = page.skip ?? 0, take = page.take ?? 100
  if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(take) || take < 1 || take > 100) return fail("INVALID_INPUT", "Paginación inválida", 400)
  // Las notas anteriores siguen accesibles cuando hay más de cien cargos.
  const rows = await prisma.$queryRaw<DebitDraft[]>`SELECT * FROM "FiscalAdjustment" WHERE "accountId"=${actor.accountId} AND type='E33' AND (${canViewAll} OR "actorUserId"=${actor.id}) AND (${id}='' OR "originalDocumentId"=${id}) ORDER BY "createdAt" DESC,id DESC LIMIT ${take + 1} OFFSET ${skip}`
  return { data: rows.slice(0, take), nextSkip: rows.length > take ? skip + take : null, notice: "Documentos de prueba / No emitidos fiscalmente" }
}
export async function getDebitAdjustment(actor: Actor, id: string) {
  authorize(actor, true)
  const rows = await prisma.$queryRaw<DebitDraft[]>`SELECT * FROM "FiscalAdjustment" WHERE "accountId"=${actor.accountId} AND id=${id} AND type='E33'`
  if (!rows.length || (!hasPermission(actor, "canViewFiscalDocuments") && rows[0].actorUserId !== actor.id)) return fail("NOT_FOUND", "Nota no encontrada", 404)
  const events = await prisma.$queryRaw`SELECT state,revision,"actorUserId",details,"createdAt" FROM "FiscalAdjustmentEvent" WHERE "accountId"=${actor.accountId} AND "adjustmentId"=${id} ORDER BY "createdAt",id`
  return { ...rows[0], events, notice: "Documento de prueba / No emitido fiscalmente" }
}

export async function confirmDebitAdjustment(actor: Actor, id: string, raw: unknown) {
  authorize(actor)
  const body = object(raw, "body", ["expectedRevision", "cashOperation", "payment"])
  if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 1) return fail("INVALID_INPUT", "Revisión inválida", 400, "expectedRevision")
  const operation = object(body.cashOperation, "cashOperation", ["accountId", "userId", "clientOperationId", "cashShiftId", "clientSequence", "fiscalPolicyVersion"]) as unknown as CashOperationInput
  // Usar la misma identidad recuperable y versión exigidas a la nota de crédito.
  if (typeof operation.clientOperationId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(operation.clientOperationId) || !Number.isSafeInteger(operation.fiscalPolicyVersion) || (operation.fiscalPolicyVersion as number) < 1) return fail("INVALID_INPUT", "Indica un identificador y una versión fiscal válidos", 400, "cashOperation")
  const paymentInput = body.payment === undefined ? null : object(body.payment, "payment", ["method", "treasuryAccountId"])
  // El orden de las propiedades JSON no cambia los datos del cobro ni debe romper su reintento.
  const payment = paymentInput ? { method: paymentInput.method, treasuryAccountId: paymentInput.treasuryAccountId } : null
  const payload = { kind: "confirmDebitAdjustment", adjustmentId: id, expectedRevision: body.expectedRevision, payment }
  return cashRequest.run({ ...cashRequest.getStore(), fiscalAdjustmentRequested: true, fiscalCollectionRequested: true }, () => withCashOperation(operation, payload, () => prisma.$transaction(async tx => {
    await lockFiscalAdjustmentAccount(tx, actor.accountId)
    const draft = await get(tx, actor, id)
    if (draft.state !== "VALIDADO" || draft.revision !== body.expectedRevision) return fail("VERSION_CONFLICT", "La nota no está validada o cambió", 409)
    if (operation.fiscalPolicyVersion !== draft.policyVersion) return fail("VERSION_CONFLICT", "La versión de caja no coincide con la nota", 409)
    const input = parse(draft.input), result = await calculate(tx, actor, input)
    if (canonicalFiscalAdjustment(JSON.parse(JSON.stringify(result.calculated))) !== canonicalFiscalAdjustment(draft.snapshot)) return fail("DOCUMENT_CONFLICT", "El cálculo cambió desde la validación", 409)
    if (!result.original.saleId) return fail("DOCUMENT_CONFLICT", "Falta la venta original", 409)
    const sale = await tx.sale.findFirst({ where: { accountId: actor.accountId, id: result.original.saleId }, include: { customer: true } })
    if (!sale || sale.cancelledAt) return fail("DOCUMENT_CONFLICT", "La factura original no está disponible", 409)
    let customerId = sale.customerId
    if (input.payment.type === "CREDITO") {
      if (!sale.customer || sale.customer.isGeneric || !result.calculated.buyer?.id || result.calculated.buyer.id !== sale.customer.id) return fail("DOCUMENT_VALIDATION_FAILED", "El cargo a crédito requiere el cliente identificado de la factura", 422, "payment")
    } else if (!customerId) {
      customerId = (await tx.customer.findFirst({ where: { accountId: actor.accountId, isGeneric: true }, select: { id: true } }))?.id ?? null
      if (!customerId) return fail("DOCUMENT_CONFLICT", "No existe un cliente general para el recibo", 409)
    }
    let treasuryAccountId: string | null = null, method: PaymentMethod | null = null, transferBankName: string | null = null
    if (input.payment.type === "CONTADO") {
      if (!payment) return fail("INVALID_INPUT", "Indica el método y la cuenta para el cobro inmediato", 400, "payment")
      const selectedMethod = text(payment.method, "payment.method", 20)
      if (!["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"].includes(selectedMethod)) return fail("INVALID_INPUT", "Método de cobro inválido", 400, "payment.method")
      method = selectedMethod as PaymentMethod
      const treasury = await requireTreasuryAccount(tx, { accountId: actor.accountId, treasuryAccountId: text(payment.treasuryAccountId, "payment.treasuryAccountId"), requireActive: true })
      if (treasury.currency !== "DOP") return fail("DOCUMENT_VALIDATION_FAILED", "La cuenta debe estar en DOP", 422)
      treasuryAccountId = treasury.id
      // El recibo inmediato debe conservar el banco igual que un cobro ordinario.
      transferBankName = method === PaymentMethod.TRANSFERENCIA ? getTransferBankNameFromTreasuryAccount(treasury) : null
    } else if (payment) return fail("INVALID_INPUT", "El cargo a crédito no registra un cobro inmediato", 400, "payment")
    const amount = new Decimal(result.calculated.totals.net).mul(100)
    if (!amount.isInteger() || amount.lte(0) || amount.gt(2147483647)) return fail("DOCUMENT_VALIDATION_FAILED", "El importe del cargo es inválido", 422)
    const amountCents = amount.toNumber(), receivableId = randomUUID(), dueDate = input.payment.dueDate ? new Date(`${input.payment.dueDate}T12:00:00.000Z`) : null
    // La deuda pertenece al ajuste; no se crea una venta de producto para representar el cargo.
    await tx.$executeRaw`INSERT INTO "AccountReceivable" (id,"accountId","debitAdjustmentId","customerId","totalCents","balanceCents",status,"dueDate","updatedAt") VALUES (${receivableId},${actor.accountId},${id},${customerId},${amountCents},${amountCents},'PENDIENTE'::"AROpenStatus",${dueDate},now())`
    let paymentId: string | null = null, receiptCode: string | null = null
    if (method && treasuryAccountId) {
      const sequence = await tx.paymentSequence.upsert({ where: { accountId: actor.accountId }, create: { accountId: actor.accountId, lastNumber: 1 }, update: { lastNumber: { increment: 1 } } })
      receiptCode = `R-${String(sequence.lastNumber).padStart(6, "0")}`
      const receipt = await tx.payment.create({ data: { arId: receivableId, userId: actor.id, receiptNumber: sequence.lastNumber, receiptCode, amountCents, method, treasuryAccountId, transferBankName, note: input.reason }, select: { id: true } })
      paymentId = receipt.id
      // Auditar el mismo recibo que se contabiliza en caja; nunca crear un segundo ingreso para la copia fiscal.
      await logAuditEvent({ accountId: actor.accountId, userId: actor.id, userEmail: actor.email ?? null, userUsername: actor.username ?? null, action: "PAYMENT_CREATED", resourceType: "Payment", resourceId: receipt.id, details: { amountCents, method, treasuryAccountId, transferBankName, arId: receivableId, receiptCode, debitAdjustmentId: id } }, tx)
      await tx.$executeRaw`UPDATE "AccountReceivable" SET "balanceCents"=0,status='PAGADA'::"AROpenStatus","updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${receivableId}`
    }
    const documentId = randomUUID(), snapshot = { ...result.calculated, source: { kind: "ADJUSTMENT", id }, adjustment: { originalDocumentId: draft.originalDocumentId, reason: input.reason, amountCents, receivableId, paymentId } }
    await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","adjustmentId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES (${documentId},${actor.accountId},${id},'E33','BORRADOR',${result.calculated.policyVersion},${result.calculated.ruleVersion},${JSON.stringify(snapshot)}::jsonb,now())`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentRevision" (id,"accountId","documentId",revision,"actorUserId",input) VALUES (${randomUUID()},${actor.accountId},${documentId},1,${actor.id},${JSON.stringify(input)}::jsonb)`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentEvent" (id,"accountId","documentId","actorUserId",state,details) VALUES (${randomUUID()},${actor.accountId},${documentId},${actor.id},'BORRADOR',${JSON.stringify({ adjustmentId: id })}::jsonb)`
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO',"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${documentId}`
    for (const [index, line] of result.calculated.lines.entries()) await tx.$executeRaw`INSERT INTO "FiscalDocumentLine" (id,"accountId","documentId",position,snapshot) VALUES (${randomUUID()},${actor.accountId},${documentId},${index + 1},${JSON.stringify(line)}::jsonb)`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentReference" (id,"accountId","documentId","referencedDocumentId",snapshot) VALUES (${randomUUID()},${actor.accountId},${documentId},${draft.originalDocumentId},${JSON.stringify(result.calculated.reference)}::jsonb)`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentEvent" (id,"accountId","documentId","actorUserId",state,details) VALUES (${randomUUID()},${actor.accountId},${documentId},${actor.id},'VALIDADO',${JSON.stringify({ adjustmentId: id })}::jsonb)`
    const allocation = await reserveFiscalNumber(tx, actor, documentId, "E33")
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION',"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${documentId}`
    await tx.$executeRaw`INSERT INTO "FiscalDocumentEvent" (id,"accountId","documentId","actorUserId",state,details) VALUES (${randomUUID()},${actor.accountId},${documentId},${actor.id},'PREPARADO_PENDIENTE_CONEXION',${JSON.stringify({ adjustmentId: id, eNcf: allocation.eNcf })}::jsonb)`
    await tx.$executeRaw`UPDATE "FiscalAdjustment" SET state='PREPARADO_PENDIENTE_CONEXION',"fiscalDocumentId"=${documentId},snapshot=${JSON.stringify(snapshot)}::jsonb,"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${id}`
    await recordFiscalAdjustmentEvent(tx, actor, id, "PREPARADO_PENDIENTE_CONEXION", draft.revision, { documentId, eNcf: allocation.eNcf, amountCents, receivableId, paymentId })
    return { id, revision: draft.revision, state: "PREPARADO_PENDIENTE_CONEXION", documentId, eNcf: allocation.eNcf, amountCents, receivableId, paymentId, receiptCode, notice: "Documento de prueba / No emitido fiscalmente" }
  }, TRANSACTION_OPTIONS)))
}
