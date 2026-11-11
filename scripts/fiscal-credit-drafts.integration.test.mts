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
const { createCreditAdjustment, discardCreditAdjustment, previewCreditAdjustment, validateCreditAdjustment } = await import("../src/lib/fiscal/core/credit-drafts")
const creditDrafts = await import("../src/lib/fiscal/core/credit-drafts")
const documentCore = await import("../src/lib/fiscal/core/document")
const sequences = await import("../src/lib/fiscal/core/sequences")

const url = new URL(process.env.TEST_DATABASE_URL ?? "")
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55439" || !/^\/cash_test_stage9_\d+$/.test(url.pathname)) throw new Error("Se requiere una base fiscal local aislada de etapa 9")
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
after(async () => { await db.$disconnect() })
const owner = { id: "user-rd-owner", accountId: "baseline-account-rd", isOwner: true }
const outsider = { id: "user-doprep-owner", accountId: "baseline-account-doprep", isOwner: true }
const source = { type: "E32", issueDate: "2026-11-09", expectedPolicyVersion: 1, issuer: { id: owner.accountId, name: "Emisor prueba", identification: "123456789", country: "DO" }, source: { kind: "SALE", id: "stage9-sale" }, incomeType: "01", payment: { type: "CONTADO" }, currency: { operation: "DOP", reporting: "DOP" }, lines: [{ productId: "prod-rd-gravado", description: "Producto", kind: "BIEN", unit: "UNIDAD", quantity: "2", unitPrice: "118.00", taxTreatment: "GRAVADO_18", priceIncludesTax: true }] }
const note = { originalDocumentId: "stage9-original", expectedPolicyVersion: 1, modificationCode: "3", reason: "Devolución de prueba", lines: [{ originalLine: 1, quantity: "2.00", physicalQuantity: "2.00", extraDiscountCents: 0 }] }

test("borradores E34 reservan bajo concurrencia, permiten descartar y conservan identidad", async () => {
  await db.fiscalSettings.create({ data: { accountId: owner.accountId, enabled: true, jurisdiction: "DO", regime: "DO_ECF", environment: "TEST", configurationStatus: "VALIDATED", version: 1, legalName: "Emisor prueba", taxId: "123456789" } })
  // El segundo perfil también debe estar activo para que el aislamiento se pruebe después de la política.
  await db.fiscalSettings.create({ data: { accountId: outsider.accountId, enabled: true, jurisdiction: "DO", regime: "DO_ECF", environment: "TEST", configurationStatus: "VALIDATED", version: 1, legalName: "Otro emisor", taxId: "123456780" } })
  await db.sale.create({ data: { id: "stage9-sale", accountId: owner.accountId, userId: owner.id, customerId: "cust-rd-generic", invoiceNumber: 99992, invoiceCode: "STAGE9-TEST", soldAt: new Date("2026-11-09T12:00:00Z"), type: "CONTADO", paymentMethod: "EFECTIVO", subtotalCents: 20000, itbisCents: 3600, totalCents: 23600, items: { create: { id: "stage9-item", productId: "prod-rd-gravado", qty: 2, unitPriceCents: 11800, costCents: 6000, itbisRateBp: 1800, lineTotalCents: 23600 } } } })
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
  const allocations = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "FiscalNumberAllocation" WHERE "accountId"=${owner.accountId}`
  // El tsconfig de la aplicación apunta a una versión anterior a los literales BigInt.
  assert.equal(allocations[0].count, BigInt(2))
})
