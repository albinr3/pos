import { test, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { PrismaClient } from "@prisma/client"
import { NextRequest } from "next/server.js"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"
const require=createRequire(import.meta.url)
// Fuera del servidor Next no existe almacén de caché; esta prueba verifica efectos comerciales.
require.cache[require.resolve("next/cache")]={exports:{revalidatePath(){}}} as NodeModule
const cashContext = await import("../src/lib/cash-context")
const { cashRequest } = cashContext
const purchases = await import("../src/lib/purchases")
const { createPurchase } = purchases
const payables = await import("../src/lib/accounts-payable")
const { createStandalonePayable, addSupplierPayment } = payables
const { createFiscalDraft, prepareFiscalDraft } = await import("../src/lib/fiscal/core/preparation")
const { getE41Template } = await import("../src/lib/fiscal/core/purchase-document")
const { documentLegs } = await import("../src/lib/cash-money")
const documentCore = await import("../src/lib/fiscal/core/document")
const sequences = await import("../src/lib/fiscal/core/sequences")
const purchaseCredit = await import("../src/lib/purchase-credit")
const cashHttp = await import("../src/lib/cash-http")
const { runCashTransaction } = await import("../src/lib/cash-financial-db")
const fiscalInput = await import("../src/lib/fiscal/core/input")

const url=new URL(process.env.TEST_DATABASE_URL ?? "")
if (!["localhost","127.0.0.1"].includes(url.hostname) || url.port!=="55439" || !/^\/cash_test_stage10_\d+$/.test(url.pathname)) throw Error("Se requiere una base fiscal local aislada")
const db=new PrismaClient({datasources:{db:{url:url.toString()}}})
after(async()=>db.$disconnect())
const rollback=Symbol("rollback")

test("compras, E41 y obligaciones concilian sin duplicar inventario ni pagos",async()=>{
 try {
  await db.$transaction(async tx=>{
   const suffix=randomUUID(), account=await tx.account.create({data:{name:"Etapa 11",clerkUserId:`test-${suffix}`}})
   const owner=await tx.user.create({data:{accountId:account.id,name:"Prueba",username:`u-${suffix}`,passwordHash:"test",isOwner:true}})
   await tx.companySettings.create({data:{accountId:account.id,name:"Prueba",phone:"8090000000",address:"Prueba",itbisRateBp:1800}})
   const supplier=await tx.supplier.create({data:{accountId:account.id,name:"Proveedor",chargesItbis:true,itbisRateBp:1800,fiscalIdentification:"00112345678",fiscalIdentificationCountry:"DO",fiscalLegalName:"Proveedor"}})
   const product=await tx.product.create({data:{accountId:account.id,productId:1,name:"Bien prueba",priceCents:10000,costCents:10000,fiscalItemType:"BIEN",fiscalUnit:"UNIDAD",fiscalTaxTreatment:"GRAVADO_18"}})
   const treasury=await tx.treasuryAccount.create({data:{accountId:account.id,name:"Caja",type:"CAJA",currency:"DOP"}})
   await tx.fiscalSettings.create({data:{accountId:account.id,enabled:false,jurisdiction:"DO",regime:"DO_ECF",environment:"TEST",configurationStatus:"VALIDATED",version:1,legalName:"Empresa prueba",taxId:"123456789"}})
   const createInput={supplierId:supplier.id,supplierName:supplier.name,items:[{productId:product.id,qty:1,unitCostCents:10000}],type:"CONTADO" as const,paymentMethod:"EFECTIVO" as const,treasuryAccountId:treasury.id,updateProductPrice:false}
   await cashRequest.run({tx,trustedActor:owner,deviceHash:""},async()=>{
    const ordinary=await createPurchase(owner,{...createInput,supplierReceiptNumber:"B0100000001"})
    assert.equal(ordinary.supplierReceiptNumber,"B0100000001")
    assert.equal(ordinary.totalCents,11800)
    const administrative=await createPurchase(owner,createInput)
    assert.equal(administrative.supplierReceiptNumber,null)
    assert.equal(await tx.fiscalDocument.count({where:{purchaseId:administrative.id}}),0)
    await tx.fiscalSettings.update({where:{accountId:account.id},data:{enabled:true}})
    // Simular una petición nueva: no reutilizar la comprobación fiscal del perfil apagado.
    cashRequest.getStore()!.fiscalCheckedAccountId=undefined
    await tx.fiscalSequence.create({data:{accountId:account.id,type:"E41",rangeStart:BigInt(1),rangeEnd:BigInt(50),lastNumber:BigInt(0),expiresOn:new Date("2099-12-31"),active:true}})
    await assert.rejects(getE41Template(owner,"PURCHASE",ordinary.id,tx),/comprobante recibido/)
    const cash=await createPurchase(owner,{...createInput,e41CashPaidCents:10000,e41DeclaredUnregistered:true})
    assert.equal(cash.paidCents,10000)
    const storedCash=await tx.purchase.findUniqueOrThrow({where:{id:cash.id}})
    assert.equal(documentLegs("purchase",storedCash)[0].amountCents,-10000)
    const cashDoc=await getE41Template(owner,"PURCHASE",cash.id,tx)
    await assert.rejects(createFiscalDraft(owner,{operationId:`received-draft-${suffix}`,document:{...cashDoc,source:{kind:"PURCHASE",id:ordinary.id}}}),/comprobante recibido/)
    let mobileActor: typeof owner | {id:string;accountId:string;isOwner:boolean} | null=null
    const modules=new Map<string,Record<string,unknown>>()
    function compile(file:string): Record<string,any> {
     if(modules.has(file)) return modules.get(file)!
     const exports:Record<string,unknown>={};modules.set(file,exports)
     const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
     vm.runInNewContext(js,{exports,console,crypto:globalThis.crypto,require(name:string){
      if(name==="../../documents/_shared") return compile("src/app/api/fiscal/documents/_shared.ts")
      if(name==="../../_helpers/auth") return {getCurrentUserFromRequest:async()=>mobileActor}
      if(name==="@/app/api/_helpers/auth") return {getCurrentUserFromRequest:async()=>mobileActor}
      // La autenticación y el contexto HTTP se simulan; la ruta y los servicios son reales.
      if(name==="@/lib/purchase-http") return {purchaseAPI:async (_request:Request, fn:(actor:typeof owner)=>Promise<unknown>)=>{const result=await fn(mobileActor as typeof owner);return result instanceof Response?result:Response.json(result)},purchaseBody:async (request:Request)=>request.json(),purchaseFilters:()=>({})}
      if(name==="@/lib/purchases") return purchases
      if(name==="@/lib/accounts-payable") return payables
      if(name==="@/lib/purchase-queries") return {listPurchaseRecords:async()=>({data:[]})}
      if(name==="@/lib/purchase-credit") return purchaseCredit
      if(name==="@/lib/cash-context") return cashContext
      if(name==="@/lib/cash-http") return cashHttp
      if(name==="@/lib/fiscal/core/input") return fiscalInput
      if(name==="@/lib/fiscal/core/document") return documentCore
      if(name==="@/lib/fiscal/core/sequences") return sequences
      if(name==="@/lib/fiscal/core/purchase-document") return {getE41Template:(actor:typeof owner,kind:string,id:string)=>getE41Template(actor,kind,id,tx)}
      return require(name==="next/server"?"next/server.js":name)
     }},{filename:file})
     return exports
    }
    const route=compile("src/app/api/fiscal/purchases/template/route.ts")
    const request=()=>new NextRequest(`http://localhost/api/fiscal/purchases/template?source=PURCHASE&id=${cash.id}`,{headers:{"x-subuser-token":"test","x-clerk-authorization":"test"}})
    assert.equal((await route.GET(request())).status,401)
    mobileActor={id:"denied",accountId:account.id,isOwner:false};assert.equal((await route.GET(request())).status,403)
    mobileActor=owner;assert.equal((await route.GET(request())).status,200)
    const mobilePurchase=compile("src/app/api/purchases/route.ts")
    const mobilePurchaseRequest=new NextRequest("http://localhost/api/purchases",{method:"POST",headers:{"content-type":"application/json","x-subuser-token":"test","x-clerk-authorization":"test"},body:JSON.stringify({...createInput,supplierReceiptNumber:"B0100000002"})})
    const mobilePurchaseResponse=await mobilePurchase.POST(mobilePurchaseRequest)
    const mobilePurchaseBody=await mobilePurchaseResponse.json()
    assert.equal(mobilePurchaseResponse.status,201,JSON.stringify(mobilePurchaseBody));assert.equal(mobilePurchaseBody.supplierReceiptNumber,"B0100000002")
    const cashDraft=await createFiscalDraft(owner,{operationId:`cash-draft-${suffix}`,document:cashDoc}) as {id:string}
    const purchasesBefore=await tx.purchase.count({where:{accountId:account.id}}), movementsBefore=await tx.cashMovement.count({where:{accountId:account.id}})
    const cashResult=await prepareFiscalDraft(owner,cashDraft.id,{operationId:`cash-prepare-${suffix}`,expectedRevision:1})
    assert.deepEqual(await prepareFiscalDraft(owner,cashDraft.id,{operationId:`cash-prepare-${suffix}`,expectedRevision:1}),cashResult)
    assert.equal(await tx.accountPayable.count({where:{purchaseId:cash.id}}),0)
    assert.equal(await tx.purchase.count({where:{accountId:account.id}}),purchasesBefore)
    assert.equal(await tx.cashMovement.count({where:{accountId:account.id}}),movementsBefore)
    assert.equal((await tx.purchase.findUniqueOrThrow({where:{id:cash.id}})).e41WithheldItbisCents,1800)
    const purchaseOperation={accountId:account.id,userId:owner.id,clientOperationId:`controlled-purchase-${suffix}`,cashShiftId:null,clientSequence:null,fiscalPolicyVersion:1}
    const purchaseClient={$transaction:async (callback:(inner:typeof tx)=>Promise<unknown>)=>callback(tx)}
    const controlledPurchase=()=>cashRequest.run({trustedActor:owner,deviceHash:"",operation:purchaseOperation,payloadHash:`purchase-hash-${suffix}`,fiscalPurchaseRequested:true},()=>runCashTransaction(purchaseClient,()=>createPurchase(owner,{...createInput,supplierReceiptNumber:"B0100000003",cashOperation:purchaseOperation})))
    const purchaseCountBefore=await tx.purchase.count({where:{accountId:account.id}})
    await controlledPurchase();await controlledPurchase()
    assert.equal(await tx.purchase.count({where:{accountId:account.id}}),purchaseCountBefore+1)
    const credit=await createPurchase(owner,{...createInput,type:"CREDITO",dueDate:"2099-12-30",initialPaymentCents:2000,operationId:`credit-${suffix}`})
    const before=(await tx.product.findUniqueOrThrow({where:{id:product.id}})).stock.toString()
    const creditDoc=await getE41Template(owner,"PURCHASE",credit.id,tx)
    await assert.rejects(createFiscalDraft(owner,{operationId:`undeclared-${suffix}`,document:creditDoc}),/Revisa los datos/)
    creditDoc.supplier.declaredCondition="NO_REGISTRADO"
    const creditDraft=await createFiscalDraft(owner,{operationId:`credit-draft-${suffix}`,document:creditDoc}) as {id:string}
    await prepareFiscalDraft(owner,creditDraft.id,{operationId:`credit-prepare-${suffix}`,expectedRevision:1})
    const frozen=(await tx.fiscalDocument.findUniqueOrThrow({where:{id:creditDraft.id},select:{snapshot:true}})).snapshot
    const ap=await tx.accountPayable.findUniqueOrThrow({where:{purchaseId:credit.id}})
    assert.equal(ap.totalCents,10000);assert.equal(ap.balanceCents,8000);assert.equal(ap.withheldItbisCents,1800)
    await tx.$executeRaw`SAVEPOINT stage11_guard`
    await assert.rejects(tx.$executeRaw`UPDATE "AccountPayable" SET "totalCents"=1 WHERE id=${ap.id}`,/congelados/)
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT stage11_guard`
    await addSupplierPayment(owner,{apId:ap.id,amountCents:3000,method:"EFECTIVO",treasuryAccountId:treasury.id,operationId:`pay-${suffix}`})
    assert.equal((await tx.accountPayable.findUniqueOrThrow({where:{id:ap.id}})).balanceCents,5000)
    assert.equal(await tx.supplierPayment.count({where:{apId:ap.id,cancelledAt:null}}),2)
    assert.deepEqual((await tx.fiscalDocument.findUniqueOrThrow({where:{id:creditDraft.id},select:{snapshot:true}})).snapshot,frozen)
    assert.equal((await tx.product.findUniqueOrThrow({where:{id:product.id}})).stock.toString(),before)
    // Ejercitar también el control de política e idempotencia que envuelve el pago móvil en caja.
    const cashOperation={accountId:account.id,userId:owner.id,clientOperationId:`cash-pay-${suffix}`,cashShiftId:null,clientSequence:null,fiscalPolicyVersion:1}
    const fakeClient={$transaction:async (callback:(inner:typeof tx)=>Promise<unknown>)=>callback(tx)}
    const controlled=()=>cashRequest.run({trustedActor:owner,deviceHash:"",operation:cashOperation,payloadHash:`hash-${suffix}`,fiscalSupplierPaymentRequested:true},()=>runCashTransaction(fakeClient,()=>addSupplierPayment(owner,{apId:ap.id,amountCents:1000,method:"EFECTIVO",treasuryAccountId:treasury.id,operationId:`controlled-${suffix}`,cashOperation})))
    await controlled();await controlled()
    assert.equal((await tx.accountPayable.findUniqueOrThrow({where:{id:ap.id}})).balanceCents,4000)
    assert.equal(await tx.supplierPayment.count({where:{apId:ap.id,cancelledAt:null}}),3)
    const mobilePayment=compile("src/app/api/supplier-payments/route.ts")
    const paymentRequest=()=>new NextRequest("http://localhost/api/supplier-payments",{method:"POST",headers:{"content-type":"application/json","x-subuser-token":"test","x-clerk-authorization":"test"},body:JSON.stringify({apId:ap.id,amountCents:500,method:"EFECTIVO",treasuryAccountId:treasury.id,operationId:`mobile-pay-${suffix}`})})
    assert.equal((await mobilePayment.POST(paymentRequest())).status,200);assert.equal((await mobilePayment.POST(paymentRequest())).status,200)
    assert.equal((await tx.accountPayable.findUniqueOrThrow({where:{id:ap.id}})).balanceCents,3500)
    assert.equal(await tx.supplierPayment.count({where:{apId:ap.id,cancelledAt:null}}),4)
    const overpaid=await createPurchase(owner,{...createInput,type:"CREDITO",dueDate:"2099-12-30",initialPaymentCents:11000,operationId:`overpaid-${suffix}`})
    const overpaidDoc=await getE41Template(owner,"PURCHASE",overpaid.id,tx);overpaidDoc.supplier.declaredCondition="NO_REGISTRADO"
    await assert.rejects(createFiscalDraft(owner,{operationId:`overpaid-draft-${suffix}`,document:overpaidDoc}),/superan el neto/)
    assert.equal((await tx.accountPayable.findUniqueOrThrow({where:{purchaseId:overpaid.id}})).totalCents,11800)
    const afterOverpaid=(await tx.product.findUniqueOrThrow({where:{id:product.id}})).stock.toString()
    const standalone=await createStandalonePayable(owner,{supplierId:supplier.id,description:"Servicio prueba",totalCents:11800,dueDate:"2099-12-30",operationId:`service-${suffix}`})
    const mobilePayable=compile("src/app/api/accounts-payable/route.ts")
    const mobilePayableResponse=await mobilePayable.POST(new NextRequest("http://localhost/api/accounts-payable",{method:"POST",headers:{"content-type":"application/json","x-subuser-token":"test","x-clerk-authorization":"test"},body:JSON.stringify({supplierId:supplier.id,description:"Servicio móvil",totalCents:1000,dueDate:"2099-12-30",operationId:`mobile-${suffix}`})}))
    assert.equal(mobilePayableResponse.status,200);assert.equal((await mobilePayableResponse.json()).purchaseId,null)
    const received=await createStandalonePayable(owner,{supplierId:supplier.id,description:"Servicio formal",supplierReceiptNumber:"E310000000001",totalCents:10000,dueDate:"2099-12-30",operationId:`received-${suffix}`})
    await assert.rejects(getE41Template(owner,"PAYABLE",received.id,tx),/comprobante recibido/)
    const serviceDoc=await getE41Template(owner,"PAYABLE",standalone.id,tx)
    serviceDoc.supplier.declaredCondition="NO_REGISTRADO"
    serviceDoc.lines[0].withholdings=[{kind:"ISR",rate:"10"}]
    const serviceDraft=await createFiscalDraft(owner,{operationId:`service-draft-${suffix}`,document:serviceDoc}) as {id:string}
    await prepareFiscalDraft(owner,serviceDraft.id,{operationId:`service-prepare-${suffix}`,expectedRevision:1})
    const serviceAp=await tx.accountPayable.findUniqueOrThrow({where:{id:standalone.id}})
    assert.equal(serviceAp.purchaseId,null);assert.equal(serviceAp.totalCents,10620);assert.equal(serviceAp.withheldIsrCents,1180)
    assert.equal((await tx.product.findUniqueOrThrow({where:{id:product.id}})).stock.toString(),afterOverpaid)
   })
   throw rollback
  },{timeout:60000,maxWait:5000})
 } catch(error) { if(error!==rollback) throw error }
})
