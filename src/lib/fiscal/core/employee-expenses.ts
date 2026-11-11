import { Prisma, type PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"
import { cashRequest, withCashOperation, type CashOperationInput } from "@/lib/cash-context"
import { lockPurchaseAccount, moneyCents, purchaseOperation, purchasePermit, PurchaseError, supplierPaymentAccount, type PurchaseActor } from "@/lib/purchase-credit"

export type ExpenseLine = { description: string; kind: "BIEN" | "SERVICIO"; amountCents: number; taxTreatment: string; withholdings?: unknown[] }
export type FiscalExpenseInput = {
  operationId: string
  expectedPolicyVersion: number
  description: string
  category?: string
  notes?: string
  expenseDate: string
  fundingSource: "COMPANY" | "EMPLOYEE" | "PETTY_CASH"
  employee: { name: string; identification?: string; userId?: string }
  beneficiary?: string
  supportReferences: string[]
  eligibleMinorExpense: boolean
  lines: ExpenseLine[]
  treasuryAccountId?: string
  paymentMethod?: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO"
  cashOperation?: CashOperationInput
}
const text = (value: unknown, field: string, max = 200) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new PurchaseError("INVALID_INPUT", `Indica ${field} válido`)
  return value.trim()
}
function fields(value: unknown, allowed: string[], field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new PurchaseError("INVALID_INPUT", `Campos no admitidos en ${field}`)
}
function validateLines(lines: ExpenseLine[]) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 100) throw new PurchaseError("INVALID_LINES", "Indica entre uno y cien conceptos")
  let total = 0
  const clean = lines.map(line => {
    fields(line,["description","kind","amountCents","taxTreatment","withholdings"],"el concepto")
    if (!line || !["BIEN", "SERVICIO"].includes(line.kind)) throw new PurchaseError("INVALID_LINES", "Clasifica cada concepto como bien o servicio")
    if (!["GRAVADO_18", "GRAVADO_16", "TASA_CERO", "EXENTO", "NO_FACTURABLE"].includes(line.taxTreatment)) throw new PurchaseError("INVALID_LINES", "Selecciona un tratamiento fiscal admitido")
    const amountCents = moneyCents(line.amountCents)
    total += amountCents
    if (!Number.isSafeInteger(total) || total > 2147483647) throw new PurchaseError("INVALID_AMOUNT", "El importe total supera el límite")
    if (!Array.isArray(line.withholdings ?? []) || (line.withholdings?.length ?? 0)>2) throw new PurchaseError("INVALID_LINES", "Las retenciones deben ser una lista de hasta dos elementos")
    for (const entry of line.withholdings ?? []) {
      fields(entry,["kind","rate"],"la retención")
      const retention=entry as {kind?:unknown;rate?:unknown}
      if (!["ISR","ITBIS"].includes(String(retention.kind)) || typeof retention.rate!=="string" || !/^\d{1,3}(?:\.\d{1,4})?$/.test(retention.rate) || Number(retention.rate)>100) throw new PurchaseError("INVALID_LINES", "Retención inválida")
    }
    return { description: text(line.description, "el concepto"), kind: line.kind, amountCents, taxTreatment: text(line.taxTreatment, "el tratamiento fiscal", 30), ...(line.withholdings?.length ? { withholdings: line.withholdings } : {}) }
  })
  return { lines: clean, total }
}
function scope<T>(actor: PurchaseActor, cashOperation: CashOperationInput | undefined, payload: unknown, run: () => Promise<T>) {
  // El actor procede de la sesión validada por la ruta o la acción, nunca de la carga móvil.
  return cashRequest.run({ ...cashRequest.getStore(), trustedActor: actor, fiscalExpenseRequested: true }, () => withCashOperation(cashOperation, payload, run))
}
export async function createFiscalExpense(actor: PurchaseActor, input: FiscalExpenseInput) {
  purchasePermit(actor, "canManageExpenses")
  if (!input || typeof input !== "object") throw new PurchaseError("INVALID_INPUT", "Datos de gasto inválidos")
  fields(input,["operationId","expectedPolicyVersion","description","category","notes","expenseDate","fundingSource","employee","beneficiary","supportReferences","eligibleMinorExpense","lines","treasuryAccountId","paymentMethod","cashOperation"],"el gasto")
  fields(input.employee,["name","identification","userId"],"el empleado")
  const description = text(input.description, "la descripción")
  const category = input.category ? text(input.category,"la categoría",200) : null
  const notes = input.notes ? text(input.notes,"las notas",1000) : null
  const name = text(input.employee?.name, "el empleado", 150)
  if (!["COMPANY", "EMPLOYEE", "PETTY_CASH"].includes(input.fundingSource)) throw new PurchaseError("INVALID_INPUT", "Selecciona el origen de fondos")
  if (typeof input.eligibleMinorExpense !== "boolean") throw new PurchaseError("INVALID_INPUT", "Declara si el gasto es elegible")
  if (!Array.isArray(input.supportReferences) || input.supportReferences.length > 20) throw new PurchaseError("INVALID_INPUT", "Referencias de soporte inválidas")
  const supports = input.supportReferences.map(x => text(x, "la referencia de soporte", 500))
  const parsed = validateLines(input.lines)
  const parsedDate = new Date(`${input.expenseDate}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== input.expenseDate) throw new PurchaseError("INVALID_INPUT", "Indica una fecha válida")
  // Medianoche UTC aparece como el día anterior en República Dominicana: conservar el día de negocio.
  const expenseDate = new Date(`${input.expenseDate}T04:00:00.000Z`)
  const employee = { name, ...(input.employee.identification ? { identification: text(input.employee.identification,"la identificación", 100) } : {}), ...(input.employee.userId ? { userId: text(input.employee.userId,"el usuario", 100) } : {}) }
  const details = { employee, beneficiary: input.beneficiary ? text(input.beneficiary,"el beneficiario", 150) : null, supportReferences: supports, eligibleMinorExpense: input.eligibleMinorExpense, lines: parsed.lines }
  return scope(actor, input.cashOperation, { kind: "fiscalExpense", ...input }, () => prisma.$transaction(async tx => {
    await lockPurchaseAccount(tx, actor.accountId)
    return purchaseOperation(tx, actor, "fiscalExpense", input.operationId, input, async () => {
      const settings = await tx.fiscalSettings.findUnique({ where: { accountId: actor.accountId } })
      if (!settings?.enabled || settings.jurisdiction !== "DO" || settings.regime !== "DO_ECF" || settings.environment !== "TEST" || settings.configurationStatus !== "VALIDATED" || settings.version !== input.expectedPolicyVersion) throw new PurchaseError("FISCAL_POLICY_CHANGED", "Activa una configuración fiscal de prueba válida y actualizada", 409)
      if (employee.userId && !await tx.user.findFirst({ where: { id: employee.userId, accountId: actor.accountId, isActive: true }, select: { id: true } })) throw new PurchaseError("INVALID_EMPLOYEE", "El empleado no pertenece a la empresa")
      let treasuryAccountId: string | null = null
      let paymentMethod: PaymentMethod | null = null
      if (input.fundingSource !== "EMPLOYEE") {
        const selected = await supplierPaymentAccount(tx, actor, input.paymentMethod, input.treasuryAccountId)
        if (input.fundingSource === "PETTY_CASH" && selected.account.type !== "CAJA") throw new PurchaseError("INVALID_PAYMENT_ACCOUNT", "Selecciona una cuenta de caja chica")
        treasuryAccountId = selected.account.id
        paymentMethod = selected.method
      } else if (input.treasuryAccountId || input.paymentMethod) throw new PurchaseError("INVALID_INPUT", "El adelanto personal no usa una cuenta empresarial")
      const current = cashRequest.getStore()
      if (!current || current.trustedActor?.id !== actor.id) throw new PurchaseError("UNAUTHENTICATED", "Inicia sesión", 401)
      current.fiscalExpenseAuthorizedAccountId = actor.accountId
      const expense = await tx.operatingExpense.create({ data: { accountId: actor.accountId, userId: actor.id, description, category, notes, amountCents: parsed.total, expenseDate, fundingSource: input.fundingSource, fiscalExpenseDetails: details as Prisma.InputJsonValue, treasuryAccountId, paymentMethod } })
      await tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.id, action: "OPERATING_EXPENSE_CREATED", resourceType: "OperatingExpense", resourceId: expense.id, details: { origin: input.fundingSource, amountCents: parsed.total } } })
      return { id: expense.id, amountCents: parsed.total, balanceCents: input.fundingSource === "EMPLOYEE" ? parsed.total : 0 }
    })
  }))
}
export type FiscalExpenseRevision = Pick<FiscalExpenseInput, "operationId" | "expectedPolicyVersion" | "employee" | "beneficiary" | "supportReferences" | "eligibleMinorExpense" | "lines"> & { expectedUpdatedAt: string }
export async function updateFiscalExpenseDetails(actor: PurchaseActor, expenseId: string, input: FiscalExpenseRevision) {
  purchasePermit(actor, "canManageExpenses")
  fields(input,["operationId","expectedPolicyVersion","expectedUpdatedAt","employee","beneficiary","supportReferences","eligibleMinorExpense","lines"],"la revisión")
  fields(input.employee,["name","identification","userId"],"el empleado")
  const employee = { name: text(input.employee?.name, "el empleado", 150), ...(input.employee.identification ? { identification: text(input.employee.identification,"la identificación",100) } : {}), ...(input.employee.userId ? { userId: text(input.employee.userId,"el usuario",100) } : {}) }
  if (typeof input.eligibleMinorExpense !== "boolean" || !Array.isArray(input.supportReferences) || input.supportReferences.length > 20) throw new PurchaseError("INVALID_INPUT", "Datos administrativos inválidos")
  const parsed = validateLines(input.lines)
  const details = { employee, beneficiary: input.beneficiary ? text(input.beneficiary,"el beneficiario",150) : null, supportReferences: input.supportReferences.map(x => text(x,"la referencia de soporte",500)), eligibleMinorExpense: input.eligibleMinorExpense, lines: parsed.lines }
  return scope(actor, undefined, { kind: "fiscalExpenseRevision", expenseId, ...input }, () => prisma.$transaction(async tx => {
    await lockPurchaseAccount(tx, actor.accountId)
    return purchaseOperation(tx, actor, "fiscalExpenseRevision", input.operationId, { expenseId, ...input }, async () => {
      const settings = await tx.fiscalSettings.findUnique({ where: { accountId: actor.accountId } })
      if (!settings?.enabled || settings.environment !== "TEST" || settings.jurisdiction !== "DO" || settings.regime !== "DO_ECF" || settings.configurationStatus !== "VALIDATED" || settings.version !== input.expectedPolicyVersion) throw new PurchaseError("FISCAL_POLICY_CHANGED", "La política fiscal cambió; vuelve a cargar", 409)
      const expense = await tx.operatingExpense.findFirst({ where: { accountId: actor.accountId, id: expenseId } })
      if (!expense?.fiscalExpenseDetails) throw new PurchaseError("NOT_FOUND", "Gasto fiscal no encontrado", 404)
      if (expense.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new PurchaseError("VERSION_CONFLICT", "El gasto cambió; vuelve a cargarlo", 409)
      if (parsed.total !== expense.amountCents) throw new PurchaseError("INVALID_AMOUNT", "El detalle debe conservar el importe del gasto", 409)
      if (employee.userId && !await tx.user.findFirst({ where: { id: employee.userId, accountId: actor.accountId, isActive: true }, select: { id: true } })) throw new PurchaseError("INVALID_EMPLOYEE", "El empleado no pertenece a la empresa")
      if (await tx.fiscalDocument.count({ where: { accountId: actor.accountId, expenseId, state: "PREPARADO_PENDIENTE_CONEXION" } })) throw new PurchaseError("FISCAL_DOCUMENT_EXISTS", "El gasto ya tiene un E43 preparado", 409)
      const current = cashRequest.getStore()
      if (!current || current.trustedActor?.id !== actor.id) throw new PurchaseError("UNAUTHENTICATED", "Inicia sesión", 401)
      current.fiscalExpenseAuthorizedAccountId = actor.accountId
      // Solo cambia la información de revisión, nunca el gasto, la caja ni sus reembolsos.
      const updated = await tx.operatingExpense.update({ where: { id: expenseId }, data: { fiscalExpenseDetails: details as Prisma.InputJsonValue } })
      await tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.id, action: "OPERATING_EXPENSE_EDITED", resourceType: "OperatingExpense", resourceId: expenseId, details: { previous: expense.fiscalExpenseDetails, current: details as Prisma.InputJsonValue } } })
      return { id: expenseId, updatedAt: updated.updatedAt.toISOString() }
    })
  }))
}
export async function listExpenseSettlements(actor: PurchaseActor, expenseId: string) {
  purchasePermit(actor, "canManageExpenses")
  const expense = await prisma.operatingExpense.findFirst({ where: { id: expenseId, accountId: actor.accountId }, include: { settlements: { orderBy: { createdAt: "asc" } } } })
  if (!expense) throw new PurchaseError("NOT_FOUND", "Gasto no encontrado", 404)
  const paidCents = expense.settlements.reduce((n, row) => n + row.amountCents, 0)
  return { expenseId, fundingSource: expense.fundingSource, amountCents: expense.amountCents, paidCents, balanceCents: expense.fundingSource === "EMPLOYEE" ? expense.amountCents - paidCents : 0, data: expense.settlements }
}
export type SettlementInput = { operationId: string; amountCents: number; method: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO"; treasuryAccountId: string; note?: string; cashOperation?: CashOperationInput }
export async function createExpenseSettlement(actor: PurchaseActor, expenseId: string, input: SettlementInput) {
  purchasePermit(actor, "canManageExpenses")
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PurchaseError("INVALID_INPUT", "Datos de reembolso inválidos")
  fields(input,["operationId","expenseId","amountCents","method","treasuryAccountId","note","cashOperation"],"el reembolso")
  if ("expenseId" in input && input.expenseId !== expenseId) throw new PurchaseError("INVALID_INPUT", "El gasto indicado no coincide con la ruta")
  const amountCents = moneyCents(input.amountCents)
  const note = input.note ? text(input.note,"la nota", 500) : null
  return scope(actor, input.cashOperation, { kind: "employeeExpenseSettlement", expenseId, ...input }, () => prisma.$transaction(async tx => {
    await lockPurchaseAccount(tx, actor.accountId)
    return purchaseOperation(tx, actor, "employeeExpenseSettlement", input.operationId, { expenseId, ...input }, async () => {
      const expense = await tx.operatingExpense.findFirst({ where: { accountId: actor.accountId, id: expenseId }, include: { settlements: true } })
      if (!expense || expense.fundingSource !== "EMPLOYEE") throw new PurchaseError("NOT_FOUND", "No existe un gasto adelantado por empleado", 404)
      const balance = expense.amountCents - expense.settlements.reduce((n, row) => n + row.amountCents, 0)
      if (amountCents > balance) throw new PurchaseError("OVERPAYMENT", "El reembolso supera el saldo pendiente", 409)
      const selected = await supplierPaymentAccount(tx, actor, input.method, input.treasuryAccountId)
      const current = cashRequest.getStore()
      if (!current || current.trustedActor?.id !== actor.id) throw new PurchaseError("UNAUTHENTICATED", "Inicia sesión", 401)
      current.fiscalExpenseAuthorizedAccountId = actor.accountId
      const settlement = await tx.employeeExpenseSettlement.create({ data: { accountId: actor.accountId, expenseId, userId: actor.id, amountCents, method: selected.method, treasuryAccountId: selected.account.id, note } })
      await tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.id, action: "OPERATING_EXPENSE_CREATED", resourceType: "EmployeeExpenseSettlement", resourceId: settlement.id, details: { expenseId, amountCents } } })
      return { id: settlement.id, expenseId, amountCents, balanceCents: balance - amountCents }
    })
  }))
}
