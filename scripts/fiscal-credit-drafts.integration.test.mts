import { after, test } from "node:test"
import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import fs from "node:fs"
import vm from "node:vm"
import { createRequire } from "node:module"
import ts from "typescript"
import { NextRequest } from "next/server.js"
import crypto from "node:crypto"
// Estos módulos se transpilan como CommonJS en el proyecto; usar la misma carga que la suite fiscal existente.
const { calculateFiscalDocument } = await import("../src/lib/fiscal/core/document")
const { reserveFiscalNumber } = await import("../src/lib/fiscal/core/sequences")
const { createCreditAdjustment, discardCreditAdjustment, previewCreditAdjustment, validateCreditAdjustment, confirmCreditAdjustment } = await import("../src/lib/fiscal/core/credit-drafts")
const { cashRequest } = await import("../src/lib/cash-context")
const { applyCustomerCredit } = await import("../src/lib/fiscal/core/customer-credit")
const creditDrafts = await import("../src/lib/fiscal/core/credit-drafts")
const documentCore = await import("../src/lib/fiscal/core/document")
const sequences = await import("../src/lib/fiscal/core/sequences")

const url = new URL(process.env.TEST_DATABASE_URL ?? "")
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55439" || !/^\/cash_test_stage9_\d+$/.test(url.pathname)) throw new Error("Se requiere una base fiscal local aislada de etapa 9")
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
after(async () => { await db.$disconnect() })
const owner = { id: "user-rd-owner", accountId: "baseline-account-rd", isOwner: true, name: "Dueño de prueba" }
const outsider = { id: "user-doprep-owner", accountId: "baseline-account-doprep", isOwner: true }
const source = { type: "E32", issueDate: "2026-11-09", expectedPolicyVersion: 1, issuer: { id: owner.accountId, name: "Emisor prueba", identification: "123456789", country: "DO" }, source: { kind: "SALE", id: "stage9-sale" }, incomeType: "01", payment: { type: "CONTADO" }, currency: { operation: "DOP", reporting: "DOP" }, lines: [{ productId: "prod-rd-gravado", description: "Producto", kind: "BIEN", unit: "UNIDAD", quantity: "2", unitPrice: "118.00", taxTreatment: "GRAVADO_18", priceIncludesTax: true }] }
const note = { originalDocumentId: "stage9-original", expectedPolicyVersion: 1, modificationCode: "3", reason: "Devolución de prueba", lines: [{ originalLine: 1, quantity: "2.00", physicalQuantity: "2.00", extraDiscountCents: 0 }] }

test("borradores E34 reservan bajo concurrencia, permiten descartar y conservan identidad", async () => {
  await db.fiscalSettings.create({ data: { accountId: owner.accountId, enabled: true, jurisdiction: "DO", regime: "DO_ECF", environment: "TEST", configurationStatus: "VALIDATED", version: 1, legalName: "Emisor prueba", taxId: "123456789" } })
  // El segundo perfil también debe estar activo para que el aislamiento se pruebe después de la política.
  await db.fiscalSettings.create({ data: { accountId: outsider.accountId, enabled: true, jurisdiction: "DO", regime: "DO_ECF", environment: "TEST", configurationStatus: "VALIDATED", version: 1, legalName: "Otro emisor", taxId: "123456780" } })
  await db.sale.create({ data: { id: "stage9-sale", accountId: owner.accountId, userId: owner.id, customerId: "cust-rd-generic", invoiceNumber: 99992, invoiceCode: "STAGE9-TEST", soldAt: new Date("2026-11-09T12:00:00Z"), type: "CONTADO", paymentMethod: "EFECTIVO", subtotalCents: 20000, itbisCents: 3600, totalCents: 23600, items: { create: { id: "stage9-item", productId: "prod-rd-gravado", qty: 2, unitPriceCents: 11800, costCents: 6000, itbisRateBp: 1800, lineTotalCents: 23600 } } } })
  await db.saleItemConsumption.create({ data: { saleItemId: 'stage9-item', ingredientId: 'prod-rd-gravado', qty: 2 } })
  await db.$executeRaw`INSERT INTO "FiscalSequence" (id,"accountId",type,"rangeStart","rangeEnd","lastNumber",active,"updatedAt") VALUES ('stage9-sequence',${owner.accountId},'E32',1,10,0,true,now())`
  const snapshot = { ...calculateFiscalDocument(source, 1), sale: { commercialLines: [{ saleItemId: "stage9-item", productId: "prod-rd-gravado" }] } }
  await db.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES ('stage9-original',${owner.accountId},'stage9-sale','E32','BORRADOR',1,'fixture',${JSON.stringify(snapshot)}::jsonb,now())`
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO' WHERE id='stage9-original'`
    await reserveFiscalNumber(tx, owner, "stage9-original", "E32")
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION' WHERE id='stage9-original'`
  })
  const preview = await previewCreditAdjustment(owner, note)
  assert.equal(preview.calculated.totals.gross, "236.00")
  assert.equal(preview.after[0].availableCents, 0)
  // El handler usa la implementación real y un actor simulado, sin cookies ni sesión Clerk real.
  const require = createRequire(import.meta.url), cache = new Map<string, any>()
  let mobileActor: any = null
  function compile(file: string): any {
    if (cache.has(file)) return cache.get(file)
    const exports: any = {}; cache.set(file, exports)
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(js, { exports, console, crypto, require(name: string) {
      if (name === "@/app/api/fiscal/documents/_shared") return compile("src/app/api/fiscal/documents/_shared.ts")
      if (name === "../../_helpers/auth") return { getCurrentUserFromRequest: async () => mobileActor }
      if (name === "@/lib/fiscal/core/credit-drafts") return creditDrafts
      if (name === "@/lib/fiscal/core/document") return documentCore
      if (name === "@/lib/fiscal/core/sequences") return sequences
      return require(name === "next/server" ? "next/server.js" : name)
    } }, { filename: file })
    return exports
  }
  const route = compile("src/app/api/credit-notes/preview/route.ts")
  const request = () => new NextRequest("http://localhost/api/credit-notes/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(note) })
  assert.equal((await route.POST(request())).status, 401)
  mobileActor = { id: "without-permission", accountId: owner.accountId }; assert.equal((await route.POST(request())).status, 403)
  mobileActor = outsider; assert.equal((await route.POST(request())).status, 404)
  mobileActor = owner
  const response = await route.POST(request()); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal((await response.json()).calculated.totals.gross, "236.00")
  const first = await createCreditAdjustment(owner, "stage9-create-first", note)
  assert.deepEqual(await createCreditAdjustment(owner, "stage9-create-first", note), first)
  await assert.rejects(createCreditAdjustment(owner, "stage9-create-first", { ...note, reason: "Otro motivo" }), /identificador/)
  const second = await createCreditAdjustment(owner, "stage9-create-second", note)
  await assert.rejects(previewCreditAdjustment(outsider, note), /encontrado/)
  const attempts = await Promise.allSettled([
    validateCreditAdjustment(owner, first.id, "stage9-validate-first", 1),
    validateCreditAdjustment(owner, second.id, "stage9-validate-second", 1),
  ])
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1)
  assert.equal(attempts.filter(result => result.status === "rejected").length, 1)
  const winner = attempts[0].status === "fulfilled" ? first.id : second.id
  // Apagar el perfil no debe atrapar una reserva de borrador sin efectos comerciales.
  await db.fiscalSettings.update({ where: { accountId: owner.accountId }, data: { enabled: false } })
  await discardCreditAdjustment(owner, winner, "stage9-discard-winner", 1, "Prueba")
  await db.fiscalSettings.update({ where: { accountId: owner.accountId }, data: { enabled: true } })
  assert.equal((await previewCreditAdjustment(owner, note)).after[0].availableCents, 0)
  await db.$executeRaw`INSERT INTO "FiscalSequence" (id,"accountId",type,"rangeStart","rangeEnd","lastNumber",active,"updatedAt") VALUES ('stage9-e34',${owner.accountId},'E34',1,10,0,true,now())`
  const treasury = await db.treasuryAccount.create({ data: { accountId: owner.accountId, name: "Caja para reembolso", type: "CAJA" } })
  const confirmedDraft = await createCreditAdjustment(owner, 'stage9-confirm-create', note)
  await validateCreditAdjustment(owner, confirmedDraft.id, 'stage9-confirm-validate', 1)
  const operation = { accountId: owner.accountId, userId: owner.id, clientOperationId: 'stage9-confirm-credit', cashShiftId: null, clientSequence: null, fiscalPolicyVersion: 1 }
  const command = { expectedRevision: 1, settlement: { kind: 'REFUND', method: 'EFECTIVO', treasuryAccountId: treasury.id }, cashOperation: operation }
  const stockBefore = Number((await db.product.findUniqueOrThrow({ where: { id: 'prod-rd-gravado' } })).stock)
  // Un destino inválido debe revertir la operación antes de devolver inventario o reservar número.
  await assert.rejects(cashRequest.run({ trustedActor: owner, deviceHash: '' }, () => confirmCreditAdjustment(owner, confirmedDraft.id, { ...command, settlement: { kind: 'NONE' } })), /reembolso|saldo a favor/)
  assert.equal(await db.return.count({ where: { accountId: owner.accountId, fiscalAdjustmentId: confirmedDraft.id } }), 0)
  assert.equal((await db.fiscalSequence.findUniqueOrThrow({ where: { id: 'stage9-e34' } })).lastNumber, BigInt(0))
  assert.equal(Number((await db.product.findUniqueOrThrow({ where: { id: 'prod-rd-gravado' } })).stock), stockBefore)
  // La misma operación no puede crear una segunda devolución ni consumir otra numeración.
  const confirm = () => cashRequest.run({ trustedActor: owner, deviceHash: '' }, () => confirmCreditAdjustment(owner, confirmedDraft.id, command))
  const [confirmed, simultaneous] = await Promise.all([confirm(), confirm()])
  assert.deepEqual(simultaneous, confirmed)
  assert.deepEqual(await confirm(), confirmed)
  assert.equal(confirmed.state, 'PREPARADO_PENDIENTE_CONEXION')
  assert.equal(confirmed.economicCents, 23600)
  assert.ok(confirmed.returnId)
  assert.equal(await db.return.count({ where: { accountId: owner.accountId, fiscalAdjustmentId: confirmedDraft.id } }), 1)
  assert.equal(await db.fiscalAdjustmentApplication.count({ where: { accountId: owner.accountId, adjustmentId: confirmedDraft.id, kind: 'REFUND', amountCents: 23600 } }), 1)
  assert.equal(await db.fiscalNumberAllocation.count({ where: { accountId: owner.accountId, documentId: confirmed.documentId } }), 1)
  assert.equal(Number((await db.product.findUniqueOrThrow({ where: { id: 'prod-rd-gravado' } })).stock), stockBefore + 2)
  const returned = await db.returnItem.findFirstOrThrow({ where: { returnId: confirmed.returnId! } })
  assert.deepEqual(returned.fiscalRestorations, [{ ingredientId: 'prod-rd-gravado', quantity: '2.000' }])

  // Una nota sobre deuda pagada parcialmente primero reduce el saldo y conserva el excedente del cliente.
  await db.sale.create({ data: { id: 'credit-sale', accountId: owner.accountId, userId: owner.id, customerId: 'cust-rd-credit', invoiceNumber: 99994, invoiceCode: 'CREDIT-E34', soldAt: new Date('2026-11-09T12:00:00Z'), type: 'CREDITO', subtotalCents: 10000, itbisCents: 1800, totalCents: 11800, items: { create: { id: 'credit-item', productId: 'prod-rd-gravado', qty: 1, unitPriceCents: 11800, costCents: 6000, itbisRateBp: 1800, lineTotalCents: 11800 } } } })
  const receivable = await db.accountReceivable.create({ data: { accountId: owner.accountId, saleId: 'credit-sale', customerId: 'cust-rd-credit', totalCents: 11800, balanceCents: 5000 } })
  const creditSource = { ...source, source: { kind: 'SALE', id: 'credit-sale' }, buyer: { id: 'cust-rd-credit', name: 'Cliente crédito', identification: '101111111', country: 'DO' }, payment: { type: 'CREDITO', dueDate: '2026-12-10' }, lines: [{ ...source.lines[0], quantity: '1' }] }
  const creditSnapshot = { ...calculateFiscalDocument(creditSource, 1), sale: { commercialLines: [{ saleItemId: 'credit-item', productId: 'prod-rd-gravado' }] } }
  await db.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES ('credit-original',${owner.accountId},'credit-sale','E32','BORRADOR',1,'fixture',${JSON.stringify(creditSnapshot)}::jsonb,now())`
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO' WHERE id='credit-original'`
    await reserveFiscalNumber(tx, owner, 'credit-original', 'E32')
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION' WHERE id='credit-original'`
  })
  const creditNote = { ...note, originalDocumentId: 'credit-original', lines: [{ originalLine: 1, quantity: '1.00', physicalQuantity: '0.00', extraDiscountCents: 0 }] }
  const creditDraft = await createCreditAdjustment(owner, 'credit-e34-create', creditNote)
  await validateCreditAdjustment(owner, creditDraft.id, 'credit-e34-validate', 1)
  const creditCommand = { expectedRevision: 1, settlement: { kind: 'CUSTOMER_CREDIT' }, cashOperation: { ...operation, clientOperationId: 'credit-e34-confirm' } }
  const creditConfirm = () => cashRequest.run({ trustedActor: owner, deviceHash: '' }, () => confirmCreditAdjustment(owner, creditDraft.id, creditCommand))
  const creditResult = await creditConfirm()
  assert.deepEqual(await creditConfirm(), creditResult)
  assert.equal(creditResult.debtCents, 5000); assert.equal(creditResult.excessCents, 6800); assert.equal(creditResult.returnId, null)
  assert.equal((await db.accountReceivable.findUniqueOrThrow({ where: { id: receivable.id } })).balanceCents, 0)
  assert.equal((await db.fiscalCustomerCredit.findUniqueOrThrow({ where: { id: creditResult.creditId! } })).balanceCents, 6800)
  assert.equal(await db.fiscalAdjustmentApplication.count({ where: { accountId: owner.accountId, adjustmentId: creditDraft.id, kind: 'DEBT', amountCents: 5000 } }), 1)
  assert.equal(await db.fiscalCustomerCredit.count({ where: { accountId: owner.accountId, adjustmentId: creditDraft.id } }), 1)
  assert.equal(Number((await db.product.findUniqueOrThrow({ where: { id: 'prod-rd-gravado' } })).stock), stockBefore + 2)
  await db.sale.create({ data: { id: 'credit-target-sale', accountId: owner.accountId, userId: owner.id, customerId: 'cust-rd-credit', invoiceNumber: 99995, invoiceCode: 'CREDIT-TARGET', type: 'CREDITO', subtotalCents: 5000, itbisCents: 0, totalCents: 5000 } })
  const targetDebt = await db.accountReceivable.create({ data: { accountId: owner.accountId, saleId: 'credit-target-sale', customerId: 'cust-rd-credit', totalCents: 5000, balanceCents: 5000 } })
  const paymentCount = await db.payment.count({ where: { arId: targetDebt.id } })
  const applyCommand = { receivableId: targetDebt.id, amountCents: 3000, cashOperation: { ...operation, clientOperationId: 'credit-apply-operation' } }
  // Aplicar crédito no es cobro: un reintento debe conservar el saldo y no generar pagos.
  const apply = () => cashRequest.run({ trustedActor: owner, deviceHash: '' }, () => applyCustomerCredit(owner, creditResult.creditId!, applyCommand))
  const applied = await apply(); assert.deepEqual(await apply(), applied)
  assert.equal((await db.fiscalCustomerCredit.findUniqueOrThrow({ where: { id: creditResult.creditId! } })).balanceCents, 3800)
  assert.equal((await db.accountReceivable.findUniqueOrThrow({ where: { id: targetDebt.id } })).balanceCents, 2000)
  assert.equal(await db.fiscalCustomerCreditApplication.count({ where: { accountId: owner.accountId, creditId: creditResult.creditId! } }), 1)
  assert.equal(await db.payment.count({ where: { arId: targetDebt.id } }), paymentCount)
  await db.sale.create({ data: { id: 'other-customer-sale', accountId: owner.accountId, userId: owner.id, customerId: 'cust-rd-generic', invoiceNumber: 99996, invoiceCode: 'OTHER-TARGET', type: 'CREDITO', subtotalCents: 10000, itbisCents: 0, totalCents: 10000 } })
  const otherDebt = await db.accountReceivable.create({ data: { accountId: owner.accountId, saleId: 'other-customer-sale', customerId: 'cust-rd-generic', totalCents: 10000, balanceCents: 10000 } })
  // Un crédito no puede cruzar clientes ni superar el saldo; ambos rechazos deben dejarlo intacto.
  const invalidApply = (receivableId: string, amountCents: number, clientOperationId: string) => cashRequest.run({ trustedActor: owner, deviceHash: '' }, () => applyCustomerCredit(owner, creditResult.creditId!, { receivableId, amountCents, cashOperation: { ...operation, clientOperationId } }))
  await assert.rejects(invalidApply(otherDebt.id, 1000, 'credit-other-customer'), /clientes distintos/)
  await assert.rejects(invalidApply(targetDebt.id, 4000, 'credit-exceeds-balance'), /supera/)
  assert.equal((await db.fiscalCustomerCredit.findUniqueOrThrow({ where: { id: creditResult.creditId! } })).balanceCents, 3800)
  assert.equal((await db.accountReceivable.findUniqueOrThrow({ where: { id: otherDebt.id } })).balanceCents, 10000)
  assert.equal(await db.fiscalCustomerCreditApplication.count({ where: { accountId: owner.accountId, creditId: creditResult.creditId! } }), 1)

  // La reversión física retira la reposición, sin alterar el comprobante ni el reembolso ya conservados.
  const nextRequire = createRequire(import.meta.url)
  nextRequire.cache[nextRequire.resolve('next/cache')] = { exports: { revalidatePath() {} } } as NodeModule
  const { cancelReturn } = await import('../src/app/(app)/returns/actions')
  await assert.rejects(cashRequest.run({ trustedActor: owner, deviceHash: '' }, () => cancelReturn(confirmed.returnId!)), /motivo/)
  await cashRequest.run({ trustedActor: owner, deviceHash: '' }, () => cancelReturn(confirmed.returnId!, 'Corrección física'))
  assert.equal(Number((await db.product.findUniqueOrThrow({ where: { id: 'prod-rd-gravado' } })).stock), stockBefore)
  assert.equal(await db.fiscalAdjustmentApplication.count({ where: { accountId: owner.accountId, adjustmentId: confirmedDraft.id, kind: 'REFUND', amountCents: 23600 } }), 1)
  assert.equal((await db.fiscalAdjustment.findUniqueOrThrow({ where: { id: confirmedDraft.id } })).state, 'PREPARADO_PENDIENTE_CONEXION')
  const reversed = await db.$queryRaw<Array<{ details: { action?: string } }>>`SELECT details FROM "FiscalAdjustmentEvent" WHERE "accountId"=${owner.accountId} AND "adjustmentId"=${confirmedDraft.id} AND details->>'action'='PHYSICAL_REVERSED'`
  assert.equal(reversed.length, 1)
  await assert.rejects(cashRequest.run({ trustedActor: owner, deviceHash: '' }, () => cancelReturn(confirmed.returnId!, 'Repetición')), /cancelada/)
  assert.equal(Number((await db.product.findUniqueOrThrow({ where: { id: 'prod-rd-gravado' } })).stock), stockBefore)
  // Tres unidades con descuento de dos centavos requieren repartir 4, 4 y 5 centavos.
  await db.sale.create({ data: { id: "round-sale", accountId: owner.accountId, userId: owner.id, customerId: "cust-rd-generic", invoiceNumber: 99993, invoiceCode: "ROUND-TEST", soldAt: new Date("2026-11-09T12:00:00Z"), type: "CONTADO", paymentMethod: "EFECTIVO", subtotalCents: 13, itbisCents: 0, totalCents: 13, items: { create: { id: "round-item", productId: "prod-rd-gravado", qty: 3, unitPriceCents: 5, costCents: 0, itbisRateBp: 0, lineTotalCents: 13 } } } })
  const roundingSource = { ...source, source: { kind: "SALE", id: "round-sale" }, lines: [{ ...source.lines[0], quantity: "3", unitPrice: "0.05", taxTreatment: "EXENTO", discount: "0.02" }] }
  const roundingSnapshot = { ...calculateFiscalDocument(roundingSource, 1), sale: { commercialLines: [{ saleItemId: "round-item", productId: "prod-rd-gravado" }] } }
  await db.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES ('round-original',${owner.accountId},'round-sale','E32','BORRADOR',1,'fixture',${JSON.stringify(roundingSnapshot)}::jsonb,now())`
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO' WHERE id='round-original'`
    await reserveFiscalNumber(tx, owner, "round-original", "E32")
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION' WHERE id='round-original'`
  })
  const roundingNote = { ...note, originalDocumentId: "round-original", lines: [{ ...note.lines[0], quantity: "1.00", physicalQuantity: "1.00" }] }
  for (const index of [1, 2]) {
    assert.equal((await previewCreditAdjustment(owner, roundingNote)).calculated.totals.gross, "0.04")
    const draft = await createCreditAdjustment(owner, `round-create-${index}`, roundingNote)
    await validateCreditAdjustment(owner, draft.id, `round-validate-${index}`, 1)
  }
  const final = await previewCreditAdjustment(owner, { ...roundingNote, modificationCode: "1" })
  assert.equal(final.calculated.totals.gross, "0.05")
  assert.equal(final.after[0].availableCents, 0)
  const discounted = await previewCreditAdjustment(owner, { ...roundingNote, lines: [{ ...roundingNote.lines[0], extraDiscountCents: 1 }] })
  assert.equal(discounted.calculated.totals.gross, "0.04")
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  for (const [days, expectedCents, expectedIndicator] of [[30, 11800, 0], [31, 10000, 1]] as const) {
    // Calcular días calendario desde la fecha dominicana evita depender de la zona del proceso.
    const originalDay = new Date(new Date(`${today}T12:00:00Z`).getTime() - days * 86400000).toISOString().slice(0, 10)
    const saleId = `boundary-sale-${days}`, itemId = `boundary-item-${days}`, originalId = `boundary-original-${days}`
    await db.sale.create({ data: { id: saleId, accountId: owner.accountId, userId: owner.id, customerId: 'cust-rd-generic', invoiceNumber: 99000 + days, invoiceCode: `BOUNDARY-${days}`, soldAt: new Date(`${originalDay}T12:00:00Z`), type: 'CONTADO', paymentMethod: 'EFECTIVO', subtotalCents: 10000, itbisCents: 1800, totalCents: 11800, items: { create: { id: itemId, productId: 'prod-rd-gravado', qty: 1, unitPriceCents: 11800, costCents: 6000, itbisRateBp: 1800, lineTotalCents: 11800 } } } })
    const boundarySource = { ...source, issueDate: originalDay, source: { kind: 'SALE', id: saleId }, lines: [{ ...source.lines[0], quantity: '1' }] }
    // La referencia histórica es una copia ya guardada: no exigir que el catálogo actual calcule una fecha anterior a su vigencia.
    const boundarySnapshot = { ...calculateFiscalDocument({ ...boundarySource, issueDate: today }, 1), issueDate: originalDay, sale: { commercialLines: [{ saleItemId: itemId, productId: 'prod-rd-gravado' }] } }
    await db.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES (${originalId},${owner.accountId},${saleId},'E32','BORRADOR',1,'fixture',${JSON.stringify(boundarySnapshot)}::jsonb,now())`
      await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO' WHERE id=${originalId}`
      await reserveFiscalNumber(tx, owner, originalId, 'E32')
      await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION' WHERE id=${originalId}`
    })
    const boundaryNote = { ...note, originalDocumentId: originalId, lines: [{ originalLine: 1, quantity: '1.00', physicalQuantity: '0.00', extraDiscountCents: 0 }] }
    const draft = await createCreditAdjustment(owner, `boundary-create-${days}`, boundaryNote)
    await validateCreditAdjustment(owner, draft.id, `boundary-validate-${days}`, 1)
    const boundaryCommand = { expectedRevision: 1, settlement: { kind: 'REFUND', method: 'EFECTIVO', treasuryAccountId: treasury.id }, cashOperation: { ...operation, clientOperationId: `boundary-confirm-${days}` } }
    const boundaryResult = await cashRequest.run({ trustedActor: owner, deviceHash: '' }, () => confirmCreditAdjustment(owner, draft.id, boundaryCommand))
    assert.equal(boundaryResult.economicCents, expectedCents)
    const [document] = await db.$queryRaw<Array<{ snapshot: { reference: { creditIndicator: number }; totals: { taxNotCreditable: string } } }>>`SELECT snapshot FROM "FiscalDocument" WHERE id=${boundaryResult.documentId} AND "accountId"=${owner.accountId}`
    assert.equal(document.snapshot.reference.creditIndicator, expectedIndicator)
    assert.equal(document.snapshot.totals.taxNotCreditable, days === 30 ? '0.00' : '18.00')
    assert.equal(await db.fiscalAdjustmentApplication.count({ where: { accountId: owner.accountId, adjustmentId: draft.id, kind: 'REFUND', amountCents: expectedCents } }), 1)
  }
  const allocations = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "FiscalNumberAllocation" WHERE "accountId"=${owner.accountId}`
  // El tsconfig de la aplicación apunta a una versión anterior a los literales BigInt.
  assert.equal(allocations[0].count, BigInt(9))
})
