/* eslint-disable @typescript-eslint/no-explicit-any -- Adaptador de delegados Prisma polimórficos. Los datos se validan por tenant, sesión y transacción; la suite usa PostgreSQL real. */
import { cashRequest, resolveCashIdentity, CashControlError, type CashActor, type CashRequestScope } from "@/lib/cash-context"
import type { CashShift } from "@prisma/client"
import { hasPermission, type PermissionKey } from "@/lib/permissions"
import { documentLegs, legDelta, encodeCashResult, decodeCashResult } from "@/lib/cash-money"

const financialModels = new Set(["sale", "salePayment", "payment", "supplierPayment", "purchase", "operatingExpense", "return", "treasuryTransfer", "treasuryOpeningBalance"])
const fiscalAffectedModels = new Set(["sale", "salePayment", "payment", "supplierPayment", "purchase", "operatingExpense", "return"])
const mutationNames = new Set(["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"])
const includes: Record<string, object> = { sale: { payments: true }, payment: { ar: { include: { sale: true } } }, return: { sale: true } }
const accountOf = (row: any) => row.accountId ?? row.ar?.sale?.accountId
const referenceOf = (row: any) => row.invoiceCode ?? row.receiptCode ?? row.reference ?? row.returnCode ?? row.description ?? row.note ?? row.id

async function lockAccount(tx: any, accountId: string) {
  // El mismo candado serializa activar, registrar y cerrar; evita ventas que entren después del conteo.
  // NO KEY UPDATE serializa estas operaciones y permite KEY SHARE de las claves foráneas
  // (por ejemplo, auditoría en otra conexión). FOR UPDATE bloquearía esas inserciones.
  const accounts = await tx.$queryRaw`SELECT id, "deletionRequestedAt" FROM "Account" WHERE id = ${accountId} FOR NO KEY UPDATE`
  // Una operación que esperaba el candado no puede entrar después de confirmar la baja.
  if (!accounts.length || accounts[0].deletionRequestedAt) throw new CashControlError("ACCOUNT_DELETING", "Esta cuenta está en proceso de eliminación", 403)
}
async function rowsFor(tx: any, model: string, args: any): Promise<any[]> {
  return tx[model].findMany({ where: args.where ?? { id: { in: [] } }, ...(includes[model] ? { include: includes[model] } : {}) })
}
async function currentScope(tx: any, accountId: string) {
  const scope = cashRequest.getStore()
  if (!scope) throw new Error("Falta contexto transaccional de caja")
  if (scope.trustedActor && scope.trustedActor.accountId !== accountId) throw new CashControlError("ACCOUNT_MISMATCH", "La operación pertenece a otro negocio", 403)
  if (scope.control?.accountId === accountId) return scope
  await lockAccount(tx, accountId)
  const control = await tx.cashControl.findUnique({ where: { accountId } })
  if (!control) return { ...scope, control: null }
  const identity = await resolveCashIdentity()
  if (identity.actor.accountId !== accountId) throw new CashControlError("ACCOUNT_MISMATCH", "La operación pertenece a otro negocio", 403)
  const shift = await tx.cashShift.findFirst({ where: { accountId, status: { in: ["OPEN", "CLOSING"] } } })
  Object.assign(scope, { control, trustedActor: identity.actor, deviceHash: identity.deviceHash, shift })
  return scope
}
function ownsShift(scope: any) {
  return scope.shift && scope.shift.cashierUserId === scope.trustedActor.id && scope.shift.deviceHash === scope.deviceHash
}
function requireActiveCashier(scope: CashRequestScope): asserts scope is CashRequestScope & { shift: CashShift; trustedActor: CashActor } {
  if (!scope.shift) throw new CashControlError("CASH_SHIFT_REQUIRED", "Abre un turno en Cuadre diario antes de usar la caja")
  if (!ownsShift(scope)) throw new CashControlError("CASH_SHIFT_MISMATCH", "Solo el responsable puede usar la caja desde el dispositivo de su turno")
  if (scope.shift.status !== "OPEN" && !(scope.operation?.cashShiftId === scope.shift.id && scope.operation.clientSequence !== null && scope.shift.finalSequence !== null && scope.operation.clientSequence <= scope.shift.finalSequence)) {
    throw new CashControlError("CASH_SHIFT_CLOSING", "El turno se está cerrando; termina o cancela el cierre")
  }
}

async function mutate(tx: any, model: string, action: string, args: any) {
  if (cashRequest.getStore()?.maintenance) return tx[model][action](args)
  let sourceModel = model
  let before: any[] = []
  let parentIds: string[] = []
  if (model === "salePayment") {
    sourceModel = "sale"
    const parts = action === "createMany" ? args.data : action === "create" ? [args.data] : await tx.salePayment.findMany({ where: args.where })
    parentIds = [...new Set<string>(parts.map((p: any) => p.saleId))]
    before = await rowsFor(tx, "sale", { where: { id: { in: parentIds } } })
  } else if (!action.startsWith("create")) before = await rowsFor(tx, model, args)
  let accountId = args.data?.accountId ?? (before[0] && accountOf(before[0]))
  if (!accountId && model === "payment" && args.data?.arId) {
    const ar = await tx.accountReceivable.findUnique({ where: { id: args.data.arId }, include: { sale: true } })
    accountId = ar?.sale.accountId
  }
  if (!accountId && model === "salePayment") accountId = before[0]?.accountId
  // createMany de modelos financieros debe tener un solo tenant y pasar por esta misma ruta.
  if (!accountId && action === "createMany") accountId = args.data?.[0]?.accountId
  if (!accountId) return tx[model][action](args)
  const scope = await currentScope(tx, accountId)
  if (fiscalAffectedModels.has(model) && cashRequest.getStore()?.fiscalCheckedAccountId !== accountId) {
    // El perfil activo no puede eludirse omitiendo el bloque fiscal, ni cuando caja está desactivada.
    // La preparación todavía no existe: conservar las operaciones sin crear efectos hasta implementarla.
    const fiscal = await tx.fiscalSettings.findUnique({ where: { accountId }, select: { enabled: true } })
    // Esta excepción solo cubre la creación de una venta cuya política fue comprobada
    // dentro de esta transacción; nunca habilita compras, pagos u otras mutaciones.
    const authorizedSale = model === "sale" && action === "create" && scope.fiscalSaleAuthorizedAccountId === accountId
    const authorizedCollection = model === "payment" && action === "create" && scope.fiscalCollectionRequested && !!scope.operation && !!scope.trustedActor && hasPermission(scope.trustedActor, "canAccessAccountsReceivable") && args.data?.userId === scope.trustedActor.id
    if (fiscal?.enabled && !authorizedSale && !authorizedCollection) throw new CashControlError("FISCAL_NOT_AVAILABLE", "La preparación de documentos fiscales todavía no está disponible", 409)
    const current = cashRequest.getStore()
    if (current && !fiscal?.enabled) current.fiscalCheckedAccountId = accountId
  }
  if (!scope.control) return tx[model][action](args)
  if (before.length) before = await rowsFor(tx, sourceModel, { where: { id: { in: before.map(r => r.id) } } })
  const control = scope.control
  const actor = scope.trustedActor
  if (!actor) throw new CashControlError("AUTH_REQUIRED", "Inicia sesión para operar la caja", 401)
  let transferReversal = false
  if (model === "treasuryTransfer" && action === "create" && args.data?.reversesTransferId) {
    const original = await tx.treasuryTransfer.findFirst({ where: { id: args.data.reversesTransferId, accountId } })
    if (!original || original.status !== "ACTIVE" || original.reversesTransferId ||
      args.data.fromTreasuryAccountId !== original.toTreasuryAccountId || args.data.toTreasuryAccountId !== original.fromTreasuryAccountId || args.data.amountCents !== original.amountCents) {
      throw new CashControlError("CASH_REVERSAL_INVALID", "El reverso debe corresponder exactamente al traspaso original", 400)
    }
    // El reverso tiene permiso propio y reversesTransferId es único en PostgreSQL.
    // Exigir además el permiso/identificador de una creación ordinaria impediría anular traspasos legítimos.
    transferReversal = true
  }
  if (control.enabled && action === "create") {
    const permissions: Record<string, PermissionKey> = { sale: "canAccessSales", payment: "canAccessAccountsReceivable", purchase: "canManagePurchases", supplierPayment: "canRegisterSupplierPayments", operatingExpense: "canManageExpenses", return: "canAccessReturns", treasuryTransfer: transferReversal ? "canReverseTreasuryTransfers" : "canCreateTreasuryTransfers" }
    if (permissions[model] && !hasPermission(actor, permissions[model])) throw new CashControlError("CASH_FORBIDDEN", "No tienes permiso para registrar esta operación", 403)
  }
  const correction = scope.correction
  // Notas de compra no cambian dinero ni los campos congelados del cierre.
  // Limitar la excepción a esta lista impide usar PATCH para modificar importes cerrados.
  const purchaseNotesOnly = model === "purchase" && ["update", "updateMany"].includes(action) && Object.keys(args.data ?? {}).length > 0 && Object.keys(args.data).every(key => key === "notes")
  for (const row of before) {
    if (accountOf(row) !== actor.accountId) throw new CashControlError("ACCOUNT_MISMATCH", "Operación de otro negocio", 403)
    const link = await tx.cashSourceLink.findUnique({ where: { accountId_sourceType_sourceId: { accountId, sourceType: sourceModel, sourceId: row.id } }, include: { cashShift: true } })
    if (link?.cashShift.status === "CLOSED" && !purchaseNotesOnly && !(correction?.sourceType === sourceModel && correction.sourceId === row.id)) {
      throw new CashControlError("CASH_DOCUMENT_CLOSED", "Esta operación pertenece a un cierre. Usa Corregir operación en Cuadre diario")
    }
  }
  // Crear partes de un pago dividido durante una edición no equivale a crear una venta nueva.
  if (control.enabled && (model === "sale" || model === "payment") && action.startsWith("create")) {
    // Las versiones antiguas del móvil no pueden inventar turno ni sincronizar con el usuario siguiente.
    if (!scope.operation?.cashShiftId) throw new CashControlError("CLIENT_UPDATE_REQUIRED", "Esta caja requiere un cliente actualizado con control de turnos")
    requireActiveCashier(scope)
  }
  if (args.data?.userId && action === "create" && args.data.userId !== actor.id) {
    throw new CashControlError("CASH_ACTOR_MISMATCH", "El autor debe ser el empleado autenticado", 403)
  }
  if (control.enabled && model === "treasuryOpeningBalance" && args.data?.treasuryAccountId === control.treasuryAccountId) {
    throw new CashControlError("CASH_OPENING_PROTECTED", "El fondo de caja se controla con aperturas y movimientos del turno")
  }
  // Reemplazar borrado por anulación únicamente después de activar el registro; conserva evidencia.
  let result: any
  if (model === "operatingExpense" && action.startsWith("delete")) {
    const data = { cancelledAt: new Date(), cancelledBy: actor.id, cancellationReason: correction?.reason ?? "Anulación de gasto" }
    result = action === "delete" ? await tx.operatingExpense.update({ ...args, data }) : await tx.operatingExpense.updateMany({ ...args, data })
  } else result = await tx[model][action](args)
  const ids = sourceModel === "sale" && model === "salePayment" ? parentIds : before.length ? before.map(r => r.id) : result?.id ? [result.id] : []
  if (action === "createMany" && !ids.length) throw new CashControlError("CASH_BULK_UNSUPPORTED", "Registra estas operaciones individualmente para conservar su trazabilidad")
  const after = await rowsFor(tx, sourceModel, { where: { id: { in: ids } } })
  const byId = new Map(before.map(r => [r.id, r]))
  for (const id of ids) {
    const previous = byId.get(id)
    const row = after.find(r => r.id === id)
    const delta = correction?.moneyMoved === false ? [] : legDelta(documentLegs(sourceModel, previous), documentLegs(sourceModel, row))
    if (row && accountOf(row) !== accountId) throw new CashControlError("ACCOUNT_MISMATCH", "Operación de otro negocio", 403)
    if (control.enabled) {
      for (const leg of documentLegs(sourceModel, row)) {
        const account = await tx.treasuryAccount.findFirst({ where: { id: leg.treasuryAccountId, accountId } })
        if (!account || (action === "create" && !account.isActive)) throw new CashControlError("CASH_ACCOUNT_INVALID", "Cuenta de tesorería inválida o inactiva", 400)
        if (sourceModel !== "treasuryTransfer" && sourceModel !== "treasuryOpeningBalance") {
          if (leg.method === "EFECTIVO" && account.id !== control.treasuryAccountId) throw new CashControlError("CASH_ACCOUNT_INVALID", "El efectivo debe usar la caja controlada", 400)
          if (leg.method !== "EFECTIVO" && account.type === "CAJA") throw new CashControlError("CASH_ACCOUNT_INVALID", "Selecciona Efectivo para caja o una cuenta bancaria para pagos digitales", 400)
        }
      }
      if (delta.some(l => l.treasuryAccountId === control.treasuryAccountId)) {
        requireActiveCashier(scope)
        if (action === "create" && model !== "salePayment" && !transferReversal && !scope.operation?.cashShiftId) throw new CashControlError("CLIENT_UPDATE_REQUIRED", "Registra la operación con un identificador y turno para evitar duplicados")
      }
    }
    const bound = scope.operation?.cashShiftId === scope.shift?.id
    const shift = scope.shift && ownsShift(scope) && ((!scope.operation && scope.shift.status === "OPEN") || bound) ? scope.shift : null
    if (shift && row) await tx.cashSourceLink.upsert({
      where: { accountId_sourceType_sourceId: { accountId, sourceType: sourceModel, sourceId: id } },
      create: { accountId, sourceType: sourceModel, sourceId: id, cashShiftId: shift.id }, update: {},
    })
    for (const leg of delta) await tx.cashMovement.create({ data: {
      ...leg, method: leg.method as any, accountId, sourceType: sourceModel, sourceId: id,
      reference: referenceOf(row ?? previous), cashShiftId: shift?.id ?? null, userId: actor.id,
      // now() de PostgreSQL usa el inicio de la transacción; puede ser anterior a una activación que terminó mientras esperaba el bloqueo.
      recordedAt: new Date(),
      note: correction?.reason ?? (before.length ? "Reverso o modificación" : null),
    } })
  }
  return result
}

async function guardLifecycle(tx: any, model: string, action: string, args: any) {
  if (cashRequest.getStore()?.maintenance) return tx[model][action](args)
  const rows = await tx[model].findMany({ where: args.where ?? { id: { in: [] } } })
  for (const row of rows) {
    await lockAccount(tx, row.accountId)
    if (model === "user" && (action.startsWith("delete") || args.data?.isActive === false || args.data?.canOperateCashShifts === false)) {
      const active = await tx.cashShift.count({ where: { accountId: row.accountId, cashierUserId: row.id, status: { in: ["OPEN", "CLOSING"] } } })
      if (active) throw new CashControlError("CASH_RESPONSIBLE_ACTIVE", "Cierra el turno antes de desactivar, eliminar o quitar permisos a su responsable")
    }
    if (model === "treasuryAccount") {
      const config = await tx.cashControl.findUnique({ where: { accountId: row.accountId } })
      if (config?.treasuryAccountId === row.id && (action.startsWith("delete") || args.data?.isActive === false || (args.data?.type && args.data.type !== "CAJA") || (args.data?.currency && args.data.currency !== "DOP"))) {
        throw new CashControlError("CASH_ACCOUNT_PROTECTED", "La caja controlada debe permanecer activa y en DOP")
      }
    }
  }
  return tx[model][action](args)
}

export function wrapCashTransaction(tx: any): any {
  return new Proxy(tx, { get(target, property: string) {
    const delegate = target[property]
    if (!delegate || typeof delegate !== "object") return typeof delegate === "function" ? delegate.bind(target) : delegate
    return new Proxy(delegate, { get(modelTarget, action: string) {
      const fn = modelTarget[action]
      if (typeof fn !== "function") return fn
      return async (args: any = {}) => {
        if (mutationNames.has(action) && financialModels.has(property)) return mutate(tx, property, action, args)
        if (mutationNames.has(action) && ["treasuryAccount", "user"].includes(property) && !action.startsWith("create")) return guardLifecycle(tx, property, action, args)
        if (property === "operatingExpense" && ["findMany", "findFirst", "count", "aggregate", "groupBy"].includes(action)) {
          args = { ...args, where: { AND: [args.where ?? {}, { cancelledAt: null }] } }
        }
        return fn.call(modelTarget, args)
      }
    } })
  } })
}

export async function runCashTransaction(client: any, callback: (tx: any) => Promise<any>, options?: any) {
  const parent = cashRequest.getStore()
  if (parent?.tx) return callback(wrapCashTransaction(parent.tx))
  // Resolver sesión ANTES de reservar la conexión transaccional: la autenticación consulta
  // por otra conexión y podía consumir los 5 s disponibles antes del primer bloqueo (P2028).
  let identity: Awaited<ReturnType<typeof resolveCashIdentity>> | undefined
  if (parent?.operation || !parent?.maintenance) {
    try { identity = await resolveCashIdentity() } catch (error) {
      if (parent?.operation) throw error
      // Una tarea sin sesión conserva el flujo previo; cada mutación financiera verifica su tenant.
    }
  }
  const requestScope = identity
    ? { ...parent, trustedActor: identity.actor, deviceHash: identity.deviceHash }
    : { ...parent }
  return client.$transaction(async (tx: any) => cashRequest.run({ ...requestScope, tx }, async () => {
    const scope = cashRequest.getStore()!
    const operation = scope.operation
    let fiscalPolicyVersion: number | undefined
    if (!operation && !scope.maintenance) {
      if (identity) {
        // Adquirir Account ANTES de inventario/secuencias también en compras y anulaciones.
        // Si se espera a guardar el documento, dos operaciones pueden bloquearse en orden inverso.
        await currentScope(tx, identity.actor.accountId)
      }
    }
    if (operation) {
      const { actor, deviceHash } = await resolveCashIdentity()
      const controlScope = await currentScope(tx, actor.accountId)
      {
        if (operation.accountId !== actor.accountId || operation.userId !== actor.id) throw new CashControlError("CASH_ACTOR_MISMATCH", "Vuelve a iniciar sesión con el empleado que registró los pendientes", 403)
        const boundToShift = operation.cashShiftId !== null
        if ((boundToShift && (typeof operation.cashShiftId !== "string" || !operation.cashShiftId || !Number.isSafeInteger(operation.clientSequence) || operation.clientSequence === null || operation.clientSequence < 1)) || (!boundToShift && operation.clientSequence !== null) || typeof operation.clientOperationId !== "string" || !operation.clientOperationId || !scope.payloadHash) throw new CashControlError("CASH_OPERATION_INVALID", "Operación de caja inválida", 400)
        // Recuperar el resultado ANTES de evaluar enabled: desactivar turnos nunca habilita un duplicado.
        const previous = await tx.cashOperation.findUnique({ where: { accountId_clientOperationId: { accountId: actor.accountId, clientOperationId: operation.clientOperationId } } })
        if (previous) {
          if (previous.userId !== actor.id || previous.payloadHash !== scope.payloadHash || previous.cashShiftId !== operation.cashShiftId || previous.clientSequence !== operation.clientSequence) throw new CashControlError("CASH_OPERATION_CONFLICT", "Este identificador ya corresponde a otra operación")
          return decodeCashResult(previous.response)
        }
        // Primero recuperar un commit anterior; un cambio posterior no debe convertir un reintento en una segunda operación.
        // El candado de Account también lo usa el cambio de política, por lo que la comparación y el commit son atómicos.
        const fiscal = await tx.fiscalSettings.findUnique({ where: { accountId: actor.accountId }, select: { enabled: true, version: true } })
        fiscalPolicyVersion = fiscal?.version ?? 0
        if (!scope.fiscalDiscard) {
          const supplied = operation.fiscalPolicyVersion
          if (supplied !== undefined && (!Number.isSafeInteger(supplied) || supplied < 0)) throw new CashControlError("FISCAL_POLICY_INVALID", "Versión de política fiscal inválida", 400)
          if ((fiscal?.enabled && (!(scope.fiscalSaleRequested || scope.fiscalCollectionRequested) || supplied !== fiscalPolicyVersion)) || (!fiscal?.enabled && (scope.fiscalSaleRequested || (supplied !== undefined && supplied !== fiscalPolicyVersion)))) throw new CashControlError("FISCAL_POLICY_CHANGED", "La política fiscal cambió; conserva este pendiente para revisión")
          if (!fiscal?.enabled) scope.fiscalCheckedAccountId = actor.accountId
        }
        Object.assign(scope, { trustedActor: actor, deviceHash })
        if (boundToShift) {
          if (!controlScope.control?.enabled) throw new CashControlError("CASH_CONTROL_DISABLED", "El control de turnos fue desactivado. Conserva este pendiente para revisión")
          requireActiveCashier(scope)
          if (scope.shift.id !== operation.cashShiftId || operation.clientSequence !== scope.shift.lastSequence + 1) throw new CashControlError("CASH_SEQUENCE_GAP", "Sincroniza los pendientes anteriores de este turno antes de continuar")
        }
      }
    }
    const result = await callback(wrapCashTransaction(tx))
    // Los pendientes sin turno también necesitan un recibo idempotente, aunque nunca se haya activado caja.
    if (operation) {
      const actor = scope.trustedActor
      if (!actor) throw new CashControlError("AUTH_REQUIRED", "Falta la identidad del responsable", 401)
      await tx.cashOperation.create({ data: { accountId: actor.accountId, clientOperationId: operation.clientOperationId, payloadHash: scope.payloadHash!, cashShiftId: operation.cashShiftId, clientSequence: operation.clientSequence, userId: actor.id, fiscalPolicyVersion, response: encodeCashResult(result) } })
      if (operation.cashShiftId !== null) await tx.cashShift.update({ where: { id: operation.cashShiftId }, data: { lastSequence: operation.clientSequence } })
    }
    return result
  }), options)
}

export function isCashMutation(model: string, action: string) {
  return mutationNames.has(action) && (financialModels.has(model) || (["user", "treasuryAccount"].includes(model) && !action.startsWith("create")))
}
