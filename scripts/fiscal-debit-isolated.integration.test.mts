import { after, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createRequire } from "node:module"
// Conservar los tipos de Prisma aunque la carga CommonJS se resuelva dinámicamente.
const { PrismaClient } = createRequire(import.meta.url)("@prisma/client") as typeof import("@prisma/client")
import ts from "typescript"
import { NextRequest } from "next/server.js"
import crypto from "node:crypto"
const { cashRequest } = await import("../src/lib/cash-context")
// Estos módulos se transpilan como CommonJS en el proyecto; usar la misma carga que la suite fiscal existente.
const { calculateFiscalDocument } = await import("../src/lib/fiscal/core/document")
const { reserveFiscalNumber } = await import("../src/lib/fiscal/core/sequences")
const { createDebitAdjustment, validateDebitAdjustment, previewDebitAdjustment, confirmDebitAdjustment } = await import("../src/lib/fiscal/core/debit-drafts")
const url = new URL(process.env.TEST_DATABASE_URL ?? "")
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55439" || !/^\/cash_test_stage10_\d+$/.test(url.pathname)) throw new Error("Se requiere una base fiscal local aislada de etapa 10")
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
after(async () => { await db.$disconnect() })
const owner = { id: "user-rd-owner", accountId: "baseline-account-rd", isOwner: true, name: "Dueño de prueba" }
const outsider = { id: "user-doprep-owner", accountId: "baseline-account-doprep", isOwner: true }
const source = { type: "E32", issueDate: "2026-11-09", expectedPolicyVersion: 1, issuer: { id: owner.accountId, name: "Emisor prueba", identification: "123456789", country: "DO" }, source: { kind: "SALE", id: "stage10-sale" }, incomeType: "01", payment: { type: "CONTADO" }, currency: { operation: "DOP", reporting: "DOP" }, lines: [{ productId: "prod-rd-gravado", description: "Producto", kind: "BIEN", unit: "UNIDAD", quantity: "2", unitPrice: "118.00", taxTreatment: "GRAVADO_18", priceIncludesTax: true }] }
const note = { originalDocumentId: "stage10-original", expectedPolicyVersion: 1, modificationCode: "3", reason: "Devolución de prueba", lines: [{ originalLine: 1, quantity: "2.00", physicalQuantity: "2.00", extraDiscountCents: 0 }] }

test("nota E33 crea deuda independiente y no mueve inventario", async () => {
  await db.fiscalSettings.create({ data: { accountId: owner.accountId, enabled: true, jurisdiction: "DO", regime: "DO_ECF", environment: "TEST", configurationStatus: "VALIDATED", version: 1, legalName: "Emisor prueba", taxId: "123456789" } })
  // El segundo perfil también debe estar activo para que el aislamiento se pruebe después de la política.
  await db.fiscalSettings.create({ data: { accountId: outsider.accountId, enabled: true, jurisdiction: "DO", regime: "DO_ECF", environment: "TEST", configurationStatus: "VALIDATED", version: 1, legalName: "Otro emisor", taxId: "123456780" } })
  await db.sale.create({ data: { id: "stage10-sale", accountId: owner.accountId, userId: owner.id, customerId: "cust-rd-generic", invoiceNumber: 99992, invoiceCode: "STAGE9-TEST", soldAt: new Date("2026-11-09T12:00:00Z"), type: "CONTADO", paymentMethod: "EFECTIVO", subtotalCents: 20000, itbisCents: 3600, totalCents: 23600, items: { create: { id: "stage10-item", productId: "prod-rd-gravado", qty: 2, unitPriceCents: 11800, costCents: 6000, itbisRateBp: 1800, lineTotalCents: 23600 } } } })
  await db.$executeRaw`INSERT INTO "FiscalSequence" (id,"accountId",type,"rangeStart","rangeEnd","lastNumber",active,"updatedAt") VALUES ('stage10-sequence',${owner.accountId},'E32',1,10,0,true,now())`
  const snapshot = { ...calculateFiscalDocument(source, 1), sale: { commercialLines: [{ saleItemId: "stage10-item", productId: "prod-rd-gravado" }] } }
  await db.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES ('stage10-original',${owner.accountId},'stage10-sale','E32','BORRADOR',1,'fixture',${JSON.stringify(snapshot)}::jsonb,now())`
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO' WHERE id='stage10-original'`
    await reserveFiscalNumber(tx, owner, "stage10-original", "E32")
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION' WHERE id='stage10-original'`
  })

  await db.$executeRaw`INSERT INTO "FiscalSequence" (id,"accountId",type,"rangeStart","rangeEnd","lastNumber",active,"expiresOn","updatedAt") VALUES ('stage10-e33',${owner.accountId},'E33',1,10,0,true,'2099-12-31',now())`
  const input = {originalDocumentId:'stage10-original',expectedPolicyVersion:1,reason:'Cargo adicional',payment:{type:'CONTADO'},lines:[{description:'Servicio',kind:'SERVICIO',unit:'UNIDAD',quantity:'1',unitPrice:'100.00',taxTreatment:'GRAVADO_18',priceIncludesTax:false}]}
  await assert.rejects(previewDebitAdjustment({id:'denied',accountId:owner.accountId},input),/permiso/); await assert.rejects(previewDebitAdjustment(outsider,input),/encontrado/);
  const debitDrafts=await import('../src/lib/fiscal/core/debit-drafts'), documentCore=await import('../src/lib/fiscal/core/document'), sequences=await import('../src/lib/fiscal/core/sequences')
  const require=createRequire(import.meta.url),cache=new Map<string,any>();let mobileActor:any=null
  function compile(file:string):any { if(cache.has(file)) return cache.get(file);const exports:any={};cache.set(file,exports);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{exports,console,crypto,require(name:string){if(name==='@/app/api/fiscal/documents/_shared')return compile('src/app/api/fiscal/documents/_shared.ts');if(name==='../../_helpers/auth')return {getCurrentUserFromRequest:async()=>mobileActor};if(name==='@/lib/fiscal/core/debit-drafts')return debitDrafts;if(name==='@/lib/fiscal/core/document')return documentCore;if(name==='@/lib/fiscal/core/sequences')return sequences;return require(name==='next/server'?'next/server.js':name)}},{filename:file});return exports }
  const route=compile('src/app/api/debit-notes/preview/route.ts'),request=()=>new NextRequest('http://localhost/api/debit-notes/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})
  assert.equal((await route.POST(request())).status,401);mobileActor={id:'denied',accountId:owner.accountId};assert.equal((await route.POST(request())).status,403);mobileActor=outsider;assert.equal((await route.POST(request())).status,404);mobileActor=owner;assert.equal((await route.POST(request())).status,200)
  const preview=await previewDebitAdjustment(owner,input); assert.equal(preview.calculated.totals.net,'118.00')
  const draft=await createDebitAdjustment(owner,'stage10-create',input); await validateDebitAdjustment(owner,draft.id,'stage10-validate',1)
  assert.equal((await db.fiscalAdjustment.findUnique({where:{id:draft.id}}))?.state,'VALIDADO')
  const stockBefore=(await db.product.findUniqueOrThrow({where:{id:'prod-rd-gravado'}})).stock.toString()
  const treasury=await db.treasuryAccount.create({data:{accountId:owner.accountId,name:'Caja prueba',type:'CAJA'}})
  const command={expectedRevision:1,payment:{method:'EFECTIVO',treasuryAccountId:treasury.id},cashOperation:{accountId:owner.accountId,userId:owner.id,clientOperationId:'stage10-confirm',cashShiftId:null,clientSequence:null,fiscalPolicyVersion:1}}
  const confirm=()=>cashRequest.run({trustedActor:owner,deviceHash:''},()=>confirmDebitAdjustment(owner,draft.id,command))
  const result=await confirm(); assert.deepEqual(await confirm(),result)
  await assert.rejects(cashRequest.run({trustedActor:owner,deviceHash:''},()=>confirmDebitAdjustment(owner,draft.id,{...command,payment:{...command.payment,method:'TARJETA'}})),/operaci[oó]n|datos|identificador/i)
  assert.equal(result.amountCents,11800);assert.ok(result.paymentId)
  const debt=await db.accountReceivable.findUniqueOrThrow({where:{id:result.receivableId}})
  assert.equal(debt.saleId,null);assert.equal(debt.balanceCents,0);assert.equal(debt.debitAdjustmentId,draft.id)
  assert.equal(await db.payment.count({where:{arId:debt.id}}),1)
  assert.equal((await db.product.findUniqueOrThrow({where:{id:'prod-rd-gravado'}})).stock.toString(),stockBefore)

  // El cargo a crédito debe originar una deuda propia y admitir cobros sin crear otra venta.
  await db.sale.create({data:{id:'debit-credit-sale',accountId:owner.accountId,userId:owner.id,customerId:'cust-rd-credit',invoiceNumber:99994,invoiceCode:'DEBIT-CREDIT',soldAt:new Date('2026-11-09T12:00:00Z'),type:'CONTADO',paymentMethod:'EFECTIVO',subtotalCents:20000,itbisCents:3600,totalCents:23600,items:{create:{id:'debit-credit-item',productId:'prod-rd-gravado',qty:2,unitPriceCents:11800,costCents:6000,itbisRateBp:1800,lineTotalCents:23600}}}})
  const namedSource={...source,source:{kind:'SALE',id:'debit-credit-sale'},buyer:{id:'cust-rd-credit',name:'Cliente crédito',identification:'101111111',country:'DO'}}
  const namedSnapshot={...calculateFiscalDocument(namedSource,1),sale:{commercialLines:[{saleItemId:'debit-credit-item',productId:'prod-rd-gravado'}]}}
  await db.$transaction(async tx=>{
    await tx.$executeRaw`INSERT INTO "FiscalDocument" (id,"accountId","saleId",type,state,"policyVersion","ruleVersion",snapshot,"updatedAt") VALUES ('debit-credit-original',${owner.accountId},'debit-credit-sale','E32','BORRADOR',1,'fixture',${JSON.stringify(namedSnapshot)}::jsonb,now())`
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='VALIDADO' WHERE id='debit-credit-original'`
    await reserveFiscalNumber(tx,owner,'debit-credit-original','E32')
    await tx.$executeRaw`UPDATE "FiscalDocument" SET state='PREPARADO_PENDIENTE_CONEXION' WHERE id='debit-credit-original'`
  })
  const creditInput={...input,originalDocumentId:'debit-credit-original',payment:{type:'CREDITO',dueDate:'2099-12-31'}}
  const creditDraft=await createDebitAdjustment(owner,'stage10-credit-create',creditInput)
  await validateDebitAdjustment(owner,creditDraft.id,'stage10-credit-validate',1)
  const creditCommand={expectedRevision:1,cashOperation:{...command.cashOperation,clientOperationId:'stage10-credit-confirm'}}
  const confirmCredit=()=>cashRequest.run({trustedActor:owner,deviceHash:''},()=>confirmDebitAdjustment(owner,creditDraft.id,creditCommand))
  const creditResult=await confirmCredit();assert.deepEqual(await confirmCredit(),creditResult)
  assert.equal(creditResult.paymentId,null);assert.equal(creditResult.amountCents,11800)
  assert.equal((await db.accountReceivable.findUniqueOrThrow({where:{id:creditResult.receivableId}})).balanceCents,11800)
  assert.equal(await db.payment.count({where:{arId:creditResult.receivableId}}),0)
  // Fuera de Next no hay caché de rutas: simular solo revalidatePath y mantener reales los cobros.
  require.cache[require.resolve('next/cache')]={exports:{revalidatePath(){}}} as NodeModule
  const {addPayment,cancelPayment}=await import('../src/app/(app)/ar/actions')
  const payInput={arId:creditResult.receivableId,amountCents:5000,method:'EFECTIVO' as const,treasuryAccountId:treasury.id,cashOperation:{...command.cashOperation,clientOperationId:'stage10-credit-payment'}}
  const pay=()=>cashRequest.run({trustedActor:owner,deviceHash:''},()=>addPayment(payInput))
  const paid=await pay();assert.deepEqual(await pay(),paid)
  assert.equal((await db.accountReceivable.findUniqueOrThrow({where:{id:creditResult.receivableId}})).balanceCents,6800)
  assert.equal(await db.payment.count({where:{arId:creditResult.receivableId}}),1)
  await cashRequest.run({trustedActor:owner,deviceHash:''},()=>cancelPayment(paid.paymentId,'Corrección de prueba'))
  assert.equal((await db.accountReceivable.findUniqueOrThrow({where:{id:creditResult.receivableId}})).balanceCents,11800)
  assert.ok((await db.payment.findUniqueOrThrow({where:{id:paid.paymentId}})).cancelledAt)
  assert.equal((await db.fiscalAdjustment.findUniqueOrThrow({where:{id:creditDraft.id}})).state,'PREPARADO_PENDIENTE_CONEXION')
  assert.equal((await db.product.findUniqueOrThrow({where:{id:'prod-rd-gravado'}})).stock.toString(),stockBefore)
})


