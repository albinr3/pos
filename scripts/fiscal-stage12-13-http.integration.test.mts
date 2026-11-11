// Handlers reales con firmas RSA y sesiones ficticias: sin proveedor ni red externa.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"
import { PrismaClient } from "@prisma/client"
const url=new URL(process.env.TEST_DATABASE_URL ?? "")
if(!["localhost","127.0.0.1"].includes(url.hostname)||url.port!=="55439"||!/^\/cash_test_stage13_\d+$/.test(url.pathname)) throw Error("Se requiere una base local aislada")
const keys=generateKeyPairSync("rsa",{modulusLength:2048})
process.env.JWT_SECRET=randomBytes(32).toString("hex")
process.env.CLERK_SECRET_KEY="sk_test_fixture"
process.env.CLERK_JWT_KEY=keys.publicKey.export({type:"spki",format:"pem"}).toString()
delete process.env.CLERK_AUTHORIZED_PARTIES
const db=new PrismaClient({datasources:{db:{url:url.toString()}}})
const auth=await import("../src/lib/auth")
const expense=await import("../src/app/api/operating-expenses/route")
const expenseDetail=await import("../src/app/api/operating-expenses/[id]/route")
const settlements=await import("../src/app/api/operating-expenses/[id]/settlements/route")
const e43template=await import("../src/app/api/fiscal/expenses/template/route")
const foreign=await import("../src/app/api/fiscal/foreign-payments/route")
const foreignDetail=await import("../src/app/api/fiscal/foreign-payments/[id]/route")
const foreignPreview=await import("../src/app/api/fiscal/foreign-payments/[id]/payments/preview/route")
const foreignPayment=await import("../src/app/api/fiscal/foreign-payments/[id]/payments/route")
const e47template=await import("../src/app/api/fiscal/foreign-payments/template/route")
const documents=await import("../src/app/api/fiscal/documents/route")
const prepare=await import("../src/app/api/fiscal/documents/[id]/prepare/route")
const payableRoute=await import("../src/app/api/accounts-payable/route")
const supplierPayments=await import("../src/app/api/supplier-payments/route")
const operationRecovery=await import("../src/app/api/fiscal/operations/commercial/[operationId]/route")
const transfers=await import("../src/app/api/treasury/transfers/route")
// La ejecución directa del handler carece del almacén de caché que Next crea por petición.
createRequire(import.meta.url)("next/cache").revalidatePath=()=>{}
const cashOperations=await import("../src/app/api/cash-shifts/operations/route")
const {cashRequest}=await import("../src/lib/cash-context")
after(async()=>{await db.$disconnect();const {prisma}=await import("../src/lib/db");await prisma.$disconnect()})
const ctx=(id:string)=>({params:Promise.resolve({id})})
function req(path:string,headers:Record<string,string>,method="GET",body?:unknown) { return new NextRequest(`http://localhost${path}`,{method,headers:{...headers,...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})}) }
async function headers(account:{id:string;clerkUserId:string},user:{id:string}, signingKey=keys.privateKey) {
 const clerk=jwt.sign({sub:account.clerkUserId,sid:"fixture-session"},signingKey,{algorithm:"RS256",expiresIn:60})
 return {"x-clerk-authorization":`Bearer ${clerk}`,"x-subuser-token":await auth.createSubUserSession(account.id,user.id)}
}
test("HTTP móvil con firmas ficticias: E43, reembolso y gasto ordinario",async()=>{
 const s=randomUUID(),account=await db.account.create({data:{name:"Fiscal HTTP",clerkUserId:`test-fiscal-${s}`}}), ordinaryAccount=await db.account.create({data:{name:"Ordinaria HTTP",clerkUserId:`test-ordinary-${s}`}})
 const owner=await db.user.create({data:{accountId:account.id,name:"Dueña",username:`u-${s}`,passwordHash:"test",isOwner:true}}), ordinaryOwner=await db.user.create({data:{accountId:ordinaryAccount.id,name:"Dueño",username:`v-${s}`,passwordHash:"test",isOwner:true}})
 const bank=await db.treasuryAccount.create({data:{accountId:account.id,name:"Banco",type:"BANCO",currency:"DOP"}}), ordinaryBank=await db.treasuryAccount.create({data:{accountId:ordinaryAccount.id,name:"Banco",type:"BANCO",currency:"DOP"}})
 await db.fiscalSettings.create({data:{accountId:account.id,enabled:true,jurisdiction:"DO",regime:"DO_ECF",environment:"TEST",configurationStatus:"VALIDATED",version:1,legalName:"Emisor HTTP",taxId:"123456789"}})
 for(const type of ["E43","E47"])await db.fiscalSequence.create({data:{accountId:account.id,type,rangeStart:BigInt(1),rangeEnd:BigInt(50),lastNumber:BigInt(0),expiresOn:new Date("2099-12-31"),active:true}})
 const h=await headers(account,owner),o=await headers(ordinaryAccount,ordinaryOwner),bad=await headers(account,owner,generateKeyPairSync("rsa",{modulusLength:2048}).privateKey)
 let response=await expense.POST(req("/api/operating-expenses",o,"POST",{description:"Gasto ordinario",amountCents:500,paymentMethod:"TRANSFERENCIA",treasuryAccountId:ordinaryBank.id}))
 assert.equal(response.status,201)
 const localSupplier=await db.supplier.create({data:{accountId:ordinaryAccount.id,name:"Local"}})
 response=await payableRoute.POST(req("/api/accounts-payable",o,"POST",{supplierId:localSupplier.id,description:"Servicio ordinario",totalCents:5000,dueDate:"2099-12-31",operationId:`mobile-ordinary-ap-${s}`}));assert.equal(response.status,200);const ordinaryPayable=await response.json()
 const ordinaryPayment={apId:ordinaryPayable.id,amountCents:1000,method:"TRANSFERENCIA",treasuryAccountId:ordinaryBank.id,operationId:`mobile-ordinary-pay-${s}`}
 response=await supplierPayments.POST(req("/api/supplier-payments",o,"POST",ordinaryPayment));assert.equal(response.status,200);const firstOrdinaryPayment=await response.json()
 response=await supplierPayments.POST(req("/api/supplier-payments",o,"POST",ordinaryPayment));assert.equal((await response.json()).id,firstOrdinaryPayment.id)
 const input={operationId:`mobile-expense-${s}`,expectedPolicyVersion:1,description:"Taxi",expenseDate:"2026-11-11",fundingSource:"EMPLOYEE",employee:{name:"Empleado"},supportReferences:["recibo"],eligibleMinorExpense:true,lines:[{description:"Taxi",kind:"SERVICIO",amountCents:10000,taxTreatment:"EXENTO"}]}
 response=await expense.POST(req("/api/operating-expenses",bad,"POST",{fiscalExpense:input}));assert.equal(response.status,401)
 response=await expense.POST(req("/api/operating-expenses",h,"POST",{fiscalExpense:{...input,eNcf:"E430000000001"}}));assert.equal(response.status,400)
 response=await expense.POST(req("/api/operating-expenses",h,"POST",{fiscalExpense:input}));assert.equal(response.status,200);const created=await response.json()
 response=await expense.POST(req("/api/operating-expenses",h,"POST",{fiscalExpense:input}));assert.equal((await response.json()).id,created.id)
 response=await operationRecovery.GET(req(`/api/fiscal/operations/commercial/${input.operationId}`,h),{params:Promise.resolve({operationId:input.operationId})});assert.equal(response.status,200);assert.equal((await response.json()).result.id,created.id)
 response=await operationRecovery.GET(req(`/api/fiscal/operations/commercial/${input.operationId}`,o),{params:Promise.resolve({operationId:input.operationId})});assert.equal(response.status,404)
 response=await expenseDetail.GET(req(`/api/operating-expenses/${created.id}`,o),ctx(created.id));assert.equal(response.status,404)
 const settlement={operationId:`mobile-settle-${s}`,amountCents:2000,method:"TRANSFERENCIA",treasuryAccountId:bank.id}
 response=await settlements.POST(req(`/api/operating-expenses/${created.id}/settlements`,h,"POST",settlement),ctx(created.id));assert.equal(response.status,200)
 response=await settlements.POST(req(`/api/operating-expenses/${created.id}/settlements`,h,"POST",settlement),ctx(created.id));assert.equal((await response.json()).balanceCents,8000)
 response=await expenseDetail.GET(req(`/api/operating-expenses/${created.id}`,h),ctx(created.id));const original=await response.json()
 const revision={operationId:`mobile-revision-${s}`,expectedPolicyVersion:1,expectedUpdatedAt:original.updatedAt,employee:input.employee,supportReferences:["recibo corregido"],eligibleMinorExpense:true,lines:input.lines}
 response=await expenseDetail.PUT(req(`/api/operating-expenses/${created.id}`,h,"PUT",{fiscalExpense:revision}),ctx(created.id));assert.equal(response.status,200)
 response=await expenseDetail.PUT(req(`/api/operating-expenses/${created.id}`,h,"PUT",{fiscalExpense:revision}),ctx(created.id));assert.equal(response.status,200)
 response=await e43template.GET(req(`/api/fiscal/expenses/template?id=${created.id}`,h));assert.equal(response.status,200);const template=await response.json()
 response=await documents.POST(req("/api/fiscal/documents",h,"POST",{operationId:`mobile-e43-draft-${s}`,document:template}));assert.equal(response.status,201);const draft=await response.json()
 response=await prepare.POST(req(`/api/fiscal/documents/${draft.id}/prepare`,h,"POST",{operationId:`mobile-e43-prepare-${s}`,expectedRevision:1}),ctx(draft.id));assert.equal(response.status,200)
 assert.equal((await response.json()).state,"PREPARADO_PENDIENTE_CONEXION")
 response=await expenseDetail.GET(req(`/api/operating-expenses/${created.id}`,h),ctx(created.id));assert.equal((await response.json()).fiscalDocuments[0].state,"PREPARADO_PENDIENTE_CONEXION")
 const supplier=await db.supplier.create({data:{accountId:account.id,name:"Exterior",fiscalIdentification:"US-123",fiscalIdentificationCountry:"US",fiscalResidence:"US"}})
 const obligation={operationId:`mobile-foreign-${s}`,expectedPolicyVersion:1,supplierId:supplier.id,description:"Servicio",dueDate:"2099-12-31",currency:"USD",rate:"60.0000",rateDate:"2026-11-11",declaredDominicanSource:true,lines:[{kind:"SERVICIO",description:"Servicio",amountCents:10000,isrRate:"10"}]}
 response=await foreign.POST(req("/api/fiscal/foreign-payments",h,"POST",{...obligation,externalResult:"ACCEPTED"}));assert.equal(response.status,400)
 response=await foreign.POST(req("/api/fiscal/foreign-payments",h,"POST",obligation));assert.equal(response.status,200);const operation=await response.json()
 response=await foreign.GET(req("/api/fiscal/foreign-payments?take=1",h));assert.equal(response.status,200);assert.equal((await response.json()).data[0].id,operation.id)
 response=await foreignDetail.GET(req(`/api/fiscal/foreign-payments/${operation.id}`,o),ctx(operation.id));assert.equal(response.status,404)
 const allocations=[{index:0,amountCents:10000}]
 response=await foreignPreview.POST(req(`/api/fiscal/foreign-payments/${operation.id}/payments/preview`,h,"POST",{allocations}),ctx(operation.id));assert.equal(response.status,200);const calc=await response.json()
 const payment={operationId:`mobile-foreign-pay-${s}`,expectedPolicyVersion:1,expectedNetDopCents:calc.netDopCents,allocations,method:"TRANSFERENCIA",treasuryAccountId:bank.id}
 response=await foreignPayment.POST(req(`/api/fiscal/foreign-payments/${operation.id}/payments`,h,"POST",payment),ctx(operation.id));assert.equal(response.status,200);const paid=await response.json()
 response=await foreignPayment.POST(req(`/api/fiscal/foreign-payments/${operation.id}/payments`,h,"POST",payment),ctx(operation.id));assert.equal((await response.json()).id,paid.id)
 response=await operationRecovery.GET(req(`/api/fiscal/operations/commercial/${payment.operationId}`,h),{params:Promise.resolve({operationId:payment.operationId})});assert.equal(response.status,200);assert.equal((await response.json()).result.id,paid.id)
 response=await e47template.GET(req(`/api/fiscal/foreign-payments/template?paymentId=${paid.id}`,h));assert.equal(response.status,200);const doc=await response.json()
 response=await documents.POST(req("/api/fiscal/documents",h,"POST",{operationId:`mobile-e47-draft-${s}`,document:doc}));assert.equal(response.status,201);const draft47=await response.json()
 response=await prepare.POST(req(`/api/fiscal/documents/${draft47.id}/prepare`,h,"POST",{operationId:`mobile-e47-prepare-${s}`,expectedRevision:1}),ctx(draft47.id));assert.equal(response.status,200)
 assert.equal((await response.json()).state,"PREPARADO_PENDIENTE_CONEXION")
 assert.equal(await db.supplierPayment.count({where:{apId:operation.payableId}}),1)
 // Con turno, el token de dispositivo y la secuencia deben producir un solo asiento por comando.
 const box=await db.treasuryAccount.create({data:{accountId:account.id,name:"Caja",type:"CAJA",currency:"DOP"}})
 const device=`device-${s}`,deviceHash=createHash("sha256").update(device).digest("hex")
 await db.cashControl.create({data:{accountId:account.id,treasuryAccountId:box.id,enabled:true,ledgerStartedAt:new Date()}})
 const shift=await db.cashShift.create({data:{accountId:account.id,treasuryAccountId:box.id,cashierUserId:owner.id,cashierName:owner.name,deviceHash,openingExpectedCents:0,openingCountedCents:0,openingDifferenceCents:0}})
 const withDevice={...h,"x-cash-device-token":device}
 const cash=(sequence:number)=>({accountId:account.id,userId:owner.id,cashShiftId:shift.id,clientSequence:sequence,clientOperationId:`mobile-cash-${sequence}-${s}`,fiscalPolicyVersion:1})
 const companyExpense={...input,operationId:`mobile-cash-expense-${s}`,fundingSource:"COMPANY",paymentMethod:"EFECTIVO",treasuryAccountId:box.id}
 const cashExpenseBody={fiscalExpense:companyExpense,cashOperation:cash(1)}
 response=await expense.POST(req("/api/operating-expenses",withDevice,"POST",cashExpenseBody));assert.equal(response.status,200);const cashExpense=await response.json()
 response=await expense.POST(req("/api/operating-expenses",withDevice,"POST",cashExpenseBody));assert.equal((await response.json()).id,cashExpense.id)
 assert.equal(await db.cashMovement.count({where:{accountId:account.id,sourceType:"operatingExpense",sourceId:cashExpense.id}}),1)
 const cashSettlement={operationId:`mobile-cash-refund-${s}`,amountCents:1000,method:"EFECTIVO",treasuryAccountId:box.id,cashOperation:cash(2)}
 response=await settlements.POST(req(`/api/operating-expenses/${created.id}/settlements`,withDevice,"POST",cashSettlement),ctx(created.id));assert.equal(response.status,200);const cashRefund=await response.json()
 response=await settlements.POST(req(`/api/operating-expenses/${created.id}/settlements`,withDevice,"POST",cashSettlement),ctx(created.id));assert.equal((await response.json()).id,cashRefund.id)
 assert.equal(await db.cashMovement.count({where:{accountId:account.id,sourceType:"employeeExpenseSettlement",sourceId:cashRefund.id}}),1)
 response=await foreign.POST(req("/api/fiscal/foreign-payments",h,"POST",{...obligation,operationId:`mobile-foreign-cash-${s}`}));assert.equal(response.status,200);const controlledObligation=await response.json()
 response=await foreignPreview.POST(req(`/api/fiscal/foreign-payments/${controlledObligation.id}/payments/preview`,h,"POST",{allocations}),ctx(controlledObligation.id));const controlledPreview=await response.json()
 const controlledPayment={...payment,operationId:`mobile-foreign-cash-pay-${s}`,expectedNetDopCents:controlledPreview.netDopCents,cashOperation:cash(3)}
 response=await foreignPayment.POST(req(`/api/fiscal/foreign-payments/${controlledObligation.id}/payments`,withDevice,"POST",controlledPayment),ctx(controlledObligation.id));assert.equal(response.status,200);const controlledPaid=await response.json()
 response=await foreignPayment.POST(req(`/api/fiscal/foreign-payments/${controlledObligation.id}/payments`,withDevice,"POST",controlledPayment),ctx(controlledObligation.id));assert.equal((await response.json()).id,controlledPaid.id)
 assert.equal(await db.cashMovement.count({where:{accountId:account.id,sourceType:"supplierPayment",sourceId:controlledPaid.id}}),1)
 const petty=await db.treasuryAccount.create({data:{accountId:account.id,name:"Caja chica",type:"CAJA",currency:"DOP"}})
 const beforeExpenses=await db.operatingExpense.count({where:{accountId:account.id}})
 const transferBody={fromTreasuryAccountId:bank.id,toTreasuryAccountId:petty.id,amountCents:20000,cashOperation:cash(4)}
 // El handler usa la identidad ya comprobada y el mismo hash de dispositivo que Next aporta a caja.
 const transferCall=()=>cashRequest.run({trustedActor:owner,deviceHash},()=>transfers.POST(req("/api/treasury/transfers",withDevice,"POST",transferBody)))
 response=await cashRequest.run({trustedActor:owner,deviceHash:"dispositivo-incorrecto"},()=>transfers.POST(req("/api/treasury/transfers",withDevice,"POST",transferBody)));assert.equal(response.status,409)
 response=await cashRequest.run({trustedActor:owner,deviceHash},()=>transfers.POST(req("/api/treasury/transfers",withDevice,"POST",{...transferBody,cashOperation:{...cash(4),fiscalPolicyVersion:0}})));assert.equal(response.status,409)
 response=await transferCall();assert.equal(response.status,201);const transfer=await response.json()
 response=await transferCall();assert.equal((await response.json()).id,transfer.id)
 const transferLegs=await db.cashMovement.findMany({where:{accountId:account.id,sourceType:"treasuryTransfer",sourceId:transfer.id}})
 assert.deepEqual(transferLegs.map(x=>({account:x.treasuryAccountId,amount:x.amountCents,shift:x.cashShiftId})).sort((a,b)=>a.amount-b.amount),[{account:bank.id,amount:-20000,shift:shift.id},{account:petty.id,amount:20000,shift:shift.id}])
 assert.equal(await db.operatingExpense.count({where:{accountId:account.id}}),beforeExpenses)
 const pettyExpense={...input,operationId:`mobile-petty-${s}`,fundingSource:"PETTY_CASH",paymentMethod:"EFECTIVO",treasuryAccountId:petty.id}
 const pettyBody={fiscalExpense:pettyExpense,cashOperation:cash(5)}
 response=await expense.POST(req("/api/operating-expenses",{...h,"x-cash-device-token":"otro-dispositivo"},"POST",pettyBody));assert.equal(response.status,409)
 response=await expense.POST(req("/api/operating-expenses",withDevice,"POST",pettyBody));assert.equal(response.status,200);const pettyCreated=await response.json()
 response=await expense.POST(req("/api/operating-expenses",withDevice,"POST",pettyBody));assert.equal((await response.json()).id,pettyCreated.id)
 const pettyLegs=await db.cashMovement.findMany({where:{accountId:account.id,sourceType:"operatingExpense",sourceId:pettyCreated.id}})
 assert.equal(pettyLegs.length,1);assert.equal(pettyLegs[0].treasuryAccountId,petty.id);assert.equal(pettyLegs[0].cashShiftId,shift.id);assert.equal(pettyLegs[0].amountCents,-pettyCreated.amountCents)
 // La cola web debe propagar el actor y dispositivo autenticados a la acción de transferencia.
 const queuedTransfer={kind:"transfer",payload:{fromTreasuryAccountId:bank.id,toTreasuryAccountId:petty.id,amountCents:5000},cashOperation:cash(6)}
 const queueCall=()=>cashOperations.POST(req("/api/cash-shifts/operations",withDevice,"POST",queuedTransfer))
 response=await cashOperations.POST(req("/api/cash-shifts/operations",{...h,"x-cash-device-token":"otro-dispositivo"},"POST",queuedTransfer));assert.equal(response.status,409)
 response=await queueCall();assert.equal(response.status,200);const queuedResult=(await response.json()).result
 response=await queueCall();assert.equal((await response.json()).result.id,queuedResult.id)
 assert.equal(await db.cashMovement.count({where:{accountId:account.id,sourceType:"treasuryTransfer",sourceId:queuedResult.id}}),2)
 assert.equal(await db.operatingExpense.count({where:{accountId:account.id}}),beforeExpenses+1)
 // La misma cola debe seguir funcionando con control de turnos y fiscal apagado.
 const ordinaryBox=await db.treasuryAccount.create({data:{accountId:ordinaryAccount.id,name:"Caja ordinaria",type:"CAJA",currency:"DOP"}})
 await db.cashControl.create({data:{accountId:ordinaryAccount.id,treasuryAccountId:ordinaryBox.id,enabled:true,ledgerStartedAt:new Date()}})
 const ordinaryDevice=`ordinary-device-${s}`,ordinaryHash=createHash("sha256").update(ordinaryDevice).digest("hex")
 const ordinaryShift=await db.cashShift.create({data:{accountId:ordinaryAccount.id,treasuryAccountId:ordinaryBox.id,cashierUserId:ordinaryOwner.id,cashierName:ordinaryOwner.name,deviceHash:ordinaryHash,openingExpectedCents:0,openingCountedCents:0,openingDifferenceCents:0}})
 const ordinaryQueued={kind:"transfer",payload:{fromTreasuryAccountId:ordinaryBank.id,toTreasuryAccountId:ordinaryBox.id,amountCents:2500},cashOperation:{accountId:ordinaryAccount.id,userId:ordinaryOwner.id,cashShiftId:ordinaryShift.id,clientSequence:1,clientOperationId:`ordinary-transfer-${s}`,fiscalPolicyVersion:0}}
 const ordinaryQueueCall=()=>cashOperations.POST(req("/api/cash-shifts/operations",{...o,"x-cash-device-token":ordinaryDevice},"POST",ordinaryQueued))
 response=await ordinaryQueueCall();assert.equal(response.status,200);const ordinaryTransfer=(await response.json()).result
 response=await ordinaryQueueCall();assert.equal((await response.json()).result.id,ordinaryTransfer.id)
 assert.equal(await db.cashMovement.count({where:{accountId:ordinaryAccount.id,sourceType:"treasuryTransfer",sourceId:ordinaryTransfer.id}}),2)
})
