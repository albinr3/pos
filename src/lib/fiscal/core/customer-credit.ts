import { randomUUID } from "node:crypto"
import { cashRequest, withCashOperation, type CashOperationInput } from "@/lib/cash-context"
import { prisma } from "@/lib/db"
import { hasPermission, type PermissionAwareUser } from "@/lib/permissions"
import { TRANSACTION_OPTIONS } from "@/lib/transactions"
import { FiscalDocumentError } from "./document"

type Actor = PermissionAwareUser & { id: string; accountId: string }
const fail = (code: string, message: string, status: number): never => { throw new FiscalDocumentError(code, message, status) }
function authorize(actor: Actor) {
  if (!hasPermission(actor, "canAccessAccountsReceivable") || !hasPermission(actor, "canViewFiscalDocuments")) fail("FORBIDDEN", "Sin permiso para consultar y aplicar saldos fiscales", 403)
}

export async function listCustomerCredits(actor: Actor, options: { customerId?: string; skip?: number; take?: number; availableOnly?: boolean } = {}) {
  authorize(actor)
  const id = options.customerId?.trim() ?? "", skip = options.skip ?? 0, take = options.take ?? 100
  if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(take) || take < 1 || take > 100) return fail("INVALID_INPUT", "Paginación inválida", 400)
  const availableOnly = Boolean(options.availableOnly)
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT c.id,c."customerId",customer.name AS "customerName",c."originalCents",c."balanceCents",c."createdAt",c."adjustmentId" FROM "FiscalCustomerCredit" c JOIN "Customer" customer ON customer."accountId"=c."accountId" AND customer.id=c."customerId" WHERE c."accountId"=${actor.accountId} AND (${id}='' OR c."customerId"=${id}) AND (NOT ${availableOnly} OR c."balanceCents">0) ORDER BY c."createdAt" DESC,c.id DESC LIMIT ${take + 1} OFFSET ${skip}`
  // Mantener paginación explícita para que los saldos agotados no oculten créditos disponibles.
  return { data: rows.slice(0, take), nextSkip: rows.length > take ? skip + take : null }
}

export async function applyCustomerCredit(actor: Actor, creditId: string, input: { receivableId: string; amountCents: number; cashOperation: CashOperationInput }) {
  authorize(actor)
  if (!input || typeof input !== "object" || typeof creditId !== "string" || !creditId.trim() || typeof input.receivableId !== "string" || !input.receivableId.trim() || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || !input.cashOperation) return fail("INVALID_INPUT", "Indica crédito, cuenta, importe y operación de caja válidos", 400)
  // La operación debe ser recuperable aun cuando el perfil fiscal haya sido desactivado.
  if (typeof input.cashOperation.clientOperationId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.cashOperation.clientOperationId) || !Number.isSafeInteger(input.cashOperation.fiscalPolicyVersion) || (input.cashOperation.fiscalPolicyVersion as number) < 0) return fail("INVALID_INPUT", "Indica un identificador y una versión fiscal válidos", 400)
  const payload = { kind: "applyCustomerCredit", creditId, receivableId: input.receivableId, amountCents: input.amountCents }
  // Una aplicación financiera puede terminarse tras apagar el perfil, sin preparar un comprobante nuevo.
  return cashRequest.run({ ...cashRequest.getStore(), fiscalCollectionRequested: true, fiscalCreditApplicationRequested: true }, () => withCashOperation(input.cashOperation, payload, () => prisma.$transaction(async tx => {
    const credits = await tx.$queryRaw<Array<{ id: string; customerId: string; balanceCents: number }>>`SELECT id,"customerId","balanceCents" FROM "FiscalCustomerCredit" WHERE "accountId"=${actor.accountId} AND id=${creditId} FOR UPDATE`
    const credit = credits[0]
    if (!credit) return fail("NOT_FOUND", "Saldo a favor no encontrado", 404)
    await tx.$queryRaw`SELECT id FROM "AccountReceivable" WHERE id=${input.receivableId} AND "accountId"=${actor.accountId} FOR UPDATE`
    const receivable = await tx.accountReceivable.findFirst({ where: { id: input.receivableId, accountId: actor.accountId, OR: [{ sale: { cancelledAt: null } }, { debitAdjustment: { state: "PREPARADO_PENDIENTE_CONEXION" } }] } })
    if (!receivable) return fail("NOT_FOUND", "Cuenta por cobrar no encontrada", 404)
    if (receivable.customerId !== credit.customerId) return fail("DOCUMENT_CONFLICT", "El saldo y la deuda pertenecen a clientes distintos", 409)
    if (input.amountCents > credit.balanceCents || input.amountCents > receivable.balanceCents) return fail("DOCUMENT_CONFLICT", "El importe supera el saldo disponible o la deuda", 409)
    const remaining = credit.balanceCents - input.amountCents, balance = receivable.balanceCents - input.amountCents
    await tx.$executeRaw`UPDATE "FiscalCustomerCredit" SET "balanceCents"=${remaining},"updatedAt"=now() WHERE "accountId"=${actor.accountId} AND id=${credit.id}`
    const changed = await tx.accountReceivable.updateMany({ where: { id: receivable.id, accountId: actor.accountId, balanceCents: receivable.balanceCents }, data: { balanceCents: balance, status: balance === 0 ? "PAGADA" : "PARCIAL" } })
    if (changed.count !== 1) return fail("VERSION_CONFLICT", "La deuda cambió; vuelve a intentarlo", 409)
    const applicationId = randomUUID()
    // Una aplicación de saldo no es un cobro y no debe crear un movimiento de tesorería.
    await tx.$executeRaw`INSERT INTO "FiscalCustomerCreditApplication" (id,"accountId","creditId","receivableId","amountCents","actorUserId") VALUES (${applicationId},${actor.accountId},${credit.id},${receivable.id},${input.amountCents},${actor.id})`
    return { id: applicationId, creditId: credit.id, receivableId: receivable.id, amountCents: input.amountCents, creditBalanceCents: remaining, receivableBalanceCents: balance }
  }, TRANSACTION_OPTIONS)))
}
