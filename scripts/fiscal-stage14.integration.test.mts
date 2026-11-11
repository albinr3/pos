import { test, after } from "node:test"
import assert from "node:assert/strict"
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto"
import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"
import { PrismaClient, type Prisma } from "@prisma/client"

const url=new URL(process.env.TEST_DATABASE_URL??"")
if(!["localhost","127.0.0.1"].includes(url.hostname)||url.port!=="55439"||!/^\/cash_test_stage14_\d+$/.test(url.pathname))throw Error("Se requiere una base local aislada de etapa 14")
const keys=generateKeyPairSync("rsa",{modulusLength:2048})
process.env.JWT_SECRET=randomBytes(32).toString("hex")
process.env.CLERK_SECRET_KEY="sk_test_fixture"
process.env.CLERK_JWT_KEY=keys.publicKey.export({type:"spki",format:"pem"}).toString()
delete process.env.CLERK_AUTHORIZED_PARTIES
const db=new PrismaClient({datasources:{db:{url:url.toString()}}})
const auth=await import("../src/lib/auth")
const {cashRequest}=await import("../src/lib/cash-context")
const {createStandalonePayable}=await import("../src/lib/accounts-payable")
const {getFiscalPrintable,printableText}=await import("../src/lib/fiscal/core/printable")
const {saveReceivedDocument,getReceivedDocument}=await import("../src/lib/fiscal/core/received-documents")
const {getE41Template}=await import("../src/lib/fiscal/core/purchase-document")
const {fiscalReport,reportCsvRow}=await import("../src/lib/fiscal/core/reports")
const received=await import("../src/app/api/fiscal/received-documents/route")
const receivedDetail=await import("../src/app/api/fiscal/received-documents/[id]/route")
const printable=await import("../src/app/api/fiscal/documents/[id]/printable/route")
const pdf=await import("../src/app/api/fiscal/documents/[id]/pdf/route")
const reports=await import("../src/app/api/fiscal/reports/[kind]/route")
after(async()=>{await db.$disconnect();const {prisma}=await import("../src/lib/db");await prisma.$disconnect()})
const context=(id:string)=>({params:Promise.resolve({id})})
const reportContext=(kind:string)=>({params:Promise.resolve({kind})})
function req(path:string,headers:Record<string,string>={},method="GET",body?:unknown) { return new NextRequest(`http://localhost${path}`,{method,headers:{...headers,...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})}) }
async function headers(account:{id:string;clerkUserId:string},user:{id:string}) { return {"x-clerk-authorization":`Bearer ${jwt.sign({sub:account.clerkUserId,sid:"fixture-session"},keys.privateKey,{algorithm:"RS256",expiresIn:60})}`,"x-subuser-token":await auth.createSubUserSession(account.id,user.id)} }

test("metadatos, impresión de diez tipos, conciliación y móvil aislados",async()=>{
  const suffix=randomUUID(), account=await db.account.create({data:{name:"Empresa original",clerkUserId:`stage14-${suffix}`}}), other=await db.account.create({data:{name:"Otra empresa",clerkUserId:`stage14-other-${suffix}`}})
  const owner=await db.user.create({data:{accountId:account.id,name:"Dueño",username:`owner-${suffix}`,passwordHash:"test",isOwner:true}}), outsider=await db.user.create({data:{accountId:other.id,name:"Otro",username:`other-${suffix}`,passwordHash:"test",isOwner:true}}), limited=await db.user.create({data:{accountId:account.id,name:"Limitado",username:`limited-${suffix}`,passwordHash:"test",isOwner:false}})
  const salesViewer=await db.user.create({data:{accountId:account.id,name:"Ventas",username:`sales-${suffix}`,passwordHash:"test",isOwner:false,canAccessSales:true,canAccessAccountsReceivable:true,canAccessReports:true,canViewFiscalDocuments:true}})
  await db.fiscalSettings.create({data:{accountId:account.id,enabled:true,jurisdiction:"DO",regime:"DO_ECF",environment:"TEST",configurationStatus:"VALIDATED",version:1,legalName:"Empresa original",taxId:"123456789"}})
  const supplier=await db.supplier.create({data:{accountId:account.id,name:"Proveedor original",fiscalIdentification:"123456789",fiscalIdentificationCountry:"DO"}})
  const customer=await db.customer.create({data:{accountId:account.id,visualId:101,name:"Cliente original"}})
  const bank=await db.treasuryAccount.create({data:{accountId:account.id,name:"Caja",type:"CAJA",currency:"DOP"}})
  const sale=await db.sale.create({data:{accountId:account.id,userId:owner.id,customerId:customer.id,invoiceSeries:"Z",invoiceNumber:1,invoiceCode:`Z-${suffix}`,type:"CONTADO",subtotalCents:10000,itbisCents:0,totalCents:10000}})
  const purchase=await db.purchase.create({data:{accountId:account.id,userId:owner.id,supplierId:supplier.id,supplierName:supplier.name,type:"CONTADO",totalCents:10000}})
  const purchaseE41=await db.purchase.create({data:{accountId:account.id,userId:owner.id,supplierId:supplier.id,supplierName:supplier.name,type:"CONTADO",totalCents:10000,supplierNetPaidCents:9000,e41DeclaredUnregistered:true,e41WithheldIsrCents:1000}})
  const creditPurchase=await db.purchase.create({data:{accountId:account.id,userId:owner.id,supplierId:supplier.id,supplierName:supplier.name,type:"CREDITO",totalCents:10000,e41DeclaredUnregistered:true,e41WithheldIsrCents:1000}})
  await db.accountPayable.create({data:{accountId:account.id,purchaseId:creditPurchase.id,supplierId:supplier.id,totalCents:9000,balanceCents:9000,withheldIsrCents:1000,dueDate:new Date("2026-12-01T00:00:00Z")}})
  const cancelledPurchase=await db.purchase.create({data:{accountId:account.id,userId:owner.id,supplierId:supplier.id,supplierName:supplier.name,type:"CONTADO",totalCents:50000,cancelledAt:new Date()}})
  const expense=await db.operatingExpense.create({data:{accountId:account.id,userId:owner.id,description:"Adelanto",amountCents:10000,fundingSource:"EMPLOYEE"}})
  const expenseReceived=await db.operatingExpense.create({data:{accountId:account.id,userId:owner.id,description:"Gasto con factura",amountCents:10000,fundingSource:"COMPANY"}})
  await db.employeeExpenseSettlement.create({data:{accountId:account.id,expenseId:expense.id,userId:owner.id,amountCents:3000,method:"EFECTIVO",treasuryAccountId:bank.id}})
  const payable=await db.accountPayable.create({data:{accountId:account.id,supplierId:supplier.id,description:"Exterior",totalCents:9000,balanceCents:0,withheldIsrCents:1000,dueDate:new Date("2026-12-01T00:00:00Z")}})
  const payableReceived=await db.accountPayable.create({data:{accountId:account.id,supplierId:supplier.id,description:"Servicio recibido",totalCents:10000,balanceCents:10000,dueDate:new Date("2026-12-01T00:00:00Z")}})
  const payment=await db.supplierPayment.create({data:{accountId:account.id,apId:payable.id,supplierId:supplier.id,supplierName:supplier.name,userId:owner.id,amountCents:9000,method:"EFECTIVO",treasuryAccountId:bank.id,reference:"PAGO"}})
  const foreign=await db.fiscalForeignOperation.create({data:{accountId:account.id,payableId:payable.id,currency:"USD",rate:60,lines:[],supplierSnapshot:{name:"Proveedor original"},grossForeignCents:167,expectedWithheldForeignCents:17,grossDopCents:10000,expectedWithheldDopCents:1000,originalNetCents:9000}})
  await db.fiscalForeignPayment.create({data:{accountId:account.id,foreignOperationId:foreign.id,supplierPaymentId:payment.id,snapshot:{grossDopCents:10000,withheldDopCents:1000,netDopCents:9000}}})
  const h=await headers(account,owner), otherH=await headers(other,outsider), limitedH=await headers(account,limited), salesH=await headers(account,salesViewer)
  const data={number:"B0100000001",type:"FACTURA",issueDate:"2026-11-11",supplierName:"Proveedor original",supplierIdentification:"123456789",currency:"DOP",baseCents:10000,taxCents:0,withheldCents:0,totalCents:10000}
  const command={operationId:`received-${suffix}`,sourceKind:"PURCHASE",sourceId:purchase.id,expectedRevision:0,data}
  // Distintos handlers devuelven Response o NextResponse; ambos comparten este contrato.
  let response: Response=await received.POST(req("/api/fiscal/received-documents",h,"POST",command));assert.equal(response.status,200);const created=await response.json()
  response=await received.POST(req("/api/fiscal/received-documents",h,"POST",command));assert.equal(response.status,200);assert.deepEqual(await response.json(),created)
  response=await received.POST(req("/api/fiscal/received-documents",h,"POST",{...command,data:{...data,number:"B02"}}));assert.equal(response.status,409)
  assert.equal((await db.purchase.findUniqueOrThrow({where:{id:purchase.id}})).supplierReceiptNumber,data.number)
  response=await received.POST(req("/api/fiscal/received-documents",h,"POST",{...command,operationId:`received-update-${suffix}`,expectedRevision:1,data:{...data,totalCents:9900}}));assert.equal(response.status,200);assert.equal((await response.json()).differenceCents,-100)
  const read=await getReceivedDocument(owner,created.id);assert.equal(read.revisions.length,2);assert.equal(read.revisions[0].actorName,"Dueño")
  for(const [kind,id] of [["EXPENSE",expenseReceived.id],["PAYABLE",payableReceived.id]] as const) { const result=await saveReceivedDocument(owner,{...command,operationId:`received-${kind}-${suffix}`,sourceKind:kind,sourceId:id}) as {revision:number};assert.equal(result.revision,1) }
  assert.equal((await db.accountPayable.findUniqueOrThrow({where:{id:payableReceived.id}})).supplierReceiptNumber,data.number)
  await assert.rejects(getE41Template(owner,"PURCHASE",purchase.id),/comprobante recibido/)
  response=await receivedDetail.GET(req(`/api/fiscal/received-documents/${created.id}`,otherH),context(created.id));assert.equal(response.status,404)
  response=await received.GET(req("/api/fiscal/received-documents",limitedH));assert.equal(response.status,403)
  response=await received.GET(req("/api/fiscal/received-documents"));assert.equal(response.status,401)
  await assert.rejects(saveReceivedDocument(owner,{...command,operationId:`protected-${suffix}`,sourceId:purchaseE41.id}),/pago neto declarado/)
  await assert.rejects(db.$executeRaw`UPDATE "FiscalReceivedOperation" SET revision=9 WHERE "accountId"=${account.id} AND "documentId"=${created.id}`,/inmutables/)

  const types=["E31","E32","E33","E34","E41","E43","E44","E45","E46","E47"], ids:Record<string,string>={}
  for(const [index,type] of types.entries()) {
    const source=type==="E41"?{kind:"PURCHASE",id:purchaseE41.id}:type==="E43"?{kind:"EXPENSE",id:expense.id}:type==="E47"?{kind:"SUPPLIER_PAYMENT",id:payment.id}:{kind:"SALE",id:sale.id}
    const snapshot={type,issueDate:"2026-11-11",issuer:{name:"Empresa original",identification:"123456789"},buyer:type==="E43"?null:{name:"Cliente original",identification:"123456789",country:"DO"},supplier:["E41","E47"].includes(type)?{name:"Proveedor original",identification:"123456789",country:"DO"}:null,currency:type==="E47"?{operation:"USD",reporting:"DOP",rate:"60.0000",rateDate:"2026-11-11"}:{operation:"DOP",reporting:"DOP",rate:"1.0000",rateDate:null},payment:{type:"CONTADO",dueDate:null},source,lines:[{description:"Producto original",quantity:"1.00",unit:"UNIDAD",unitPrice:"100.00",base:"100.00",tax:"0.00",gross:"100.00",taxTreatment:"EXENTO",withholdings:[]}],totals:{bases:{EXENTO:"100.00"},tax:"0.00",gross:"100.00",withheld:"10.00",withheldByKind:{ISR:"10.00",ITBIS:"0.00"},net:"90.00",taxNotCreditable:"0.00"},reportingTotals:{gross:"100.00",withheld:"10.00",net:"90.00"}}
    const doc=await db.fiscalDocument.create({data:{accountId:account.id,type,state:"PREPARADO_PENDIENTE_CONEXION",policyVersion:1,ruleVersion:"fixture",snapshot:snapshot as Prisma.InputJsonValue,...(type==="E31"?{saleId:sale.id}:type==="E41"?{purchaseId:purchaseE41.id}:type==="E43"?{expenseId:expense.id}:type==="E47"?{supplierPaymentId:payment.id}:{})}})
    // BigInt() mantiene los valores enteros con el target TypeScript usado por la suite.
    const seq=await db.fiscalSequence.create({data:{accountId:account.id,type,rangeStart:BigInt(1),rangeEnd:BigInt(10),lastNumber:BigInt(1)}})
    await db.fiscalNumberAllocation.create({data:{accountId:account.id,sequenceId:seq.id,documentId:doc.id,environment:"TEST",type,number:BigInt(1),eNcf:`E${index.toString().padStart(12,"0")}`,sequenceSnapshot:{},actorUserId:owner.id}})
    ids[type]=doc.id
    const copy=await getFiscalPrintable(owner,doc.id), text=printableText(copy).join("\n")
    assert.match(text,/Documento de prueba \/ No emitido fiscalmente/);assert.match(text,new RegExp(`Total documentado: ${type==="E47"?"USD":"DOP"} 100\\.00`));assert.equal(copy.official,null)
    if(type==="E47") {assert.match(text,/Moneda: USD - Tasa DOP: 60\.0000/);assert.match(text,/Equivalente DOP: 100\.00/)}
  }
  for (const type of ["E33","E34"]) {
    const adjustment=await db.fiscalAdjustment.create({data:{accountId:account.id,originalDocumentId:ids.E31,type,state:"PREPARADO_PENDIENTE_CONEXION",policyVersion:1,actorUserId:owner.id,input:{},snapshot:{}}})
    const doc=await db.fiscalDocument.findUniqueOrThrow({where:{id:ids[type]}})
    const snapshot={...(doc.snapshot as object),source:{kind:"ADJUSTMENT",id:adjustment.id},reference:{documentId:ids.E31,issueDate:"2026-11-10",modificationCode:"3",creditIndicator:type==="E34"?0:null},adjustment:type==="E33"?{amountCents:2000}:{economicCents:1000}}
    await db.fiscalDocument.update({where:{id:doc.id},data:{adjustmentId:adjustment.id,snapshot}})
    await db.fiscalAdjustment.update({where:{id:adjustment.id},data:{fiscalDocumentId:doc.id}})
    if(type==="E33") {
      const ar=await db.accountReceivable.create({data:{accountId:account.id,debitAdjustmentId:adjustment.id,customerId:customer.id,totalCents:2000,balanceCents:1500}})
      await db.payment.create({data:{arId:ar.id,userId:owner.id,receiptNumber:1,receiptCode:"R-ETAPA14",amountCents:500,method:"EFECTIVO",treasuryAccountId:bank.id}})
    } else {
      await db.fiscalAdjustmentApplication.create({data:{accountId:account.id,adjustmentId:adjustment.id,kind:"REFUND",amountCents:400,userId:owner.id,treasuryAccountId:bank.id,method:"EFECTIVO"}})
      await db.return.create({data:{accountId:account.id,saleId:sale.id,userId:owner.id,returnNumber:1,returnCode:"DEV-ETAPA14",subtotalCents:1000,itbisCents:0,totalCents:1000,fiscalAdjustmentId:adjustment.id}})
    }
  }
  assert.match(printableText(await getFiscalPrintable(owner,ids.E34)).join("\n"),/Comprobante original: E000000000000/)
  await db.account.update({where:{id:account.id},data:{name:"Empresa renombrada"}});await db.supplier.update({where:{id:supplier.id},data:{name:"Proveedor renombrado"}})
  const retained=printableText(await getFiscalPrintable(owner,ids.E41)).join("\n");assert.match(retained,/Empresa original/);assert.match(retained,/Producto original/);assert.match(retained,/Proveedor original/)
  response=await printable.GET(req(`/api/fiscal/documents/${ids.E47}/printable`,h),context(ids.E47));assert.equal(response.status,200);assert.equal((await response.json()).snapshot.type,"E47")
  response=await printable.GET(req(`/api/fiscal/documents/${ids.E47}/printable`,otherH),context(ids.E47));assert.equal(response.status,404)
  response=await pdf.GET(req(`/api/fiscal/documents/${ids.E41}/pdf`,h),context(ids.E41));assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"application/pdf");const pdfBytes=Buffer.from(await response.arrayBuffer());assert.ok(pdfBytes.byteLength>100);assert.match(pdfBytes.toString("latin1"),/Documento de prueba \/ No emitido fiscalmente/);assert.match(pdfBytes.toString("latin1"),/Total documentado: DOP 100\.00/)
  response=await pdf.GET(req(`/api/fiscal/documents/${ids.E41}/pdf`,limitedH),context(ids.E41));assert.equal(response.status,403)

  const reconciliation=await fiscalReport(owner,"reconciliation",new URLSearchParams({take:"200"}))
  const p=reconciliation.data.find(row=>row.sourceKind==="PURCHASE"&&row.sourceId===purchaseE41.id)!
  assert.equal(reconciliation.data.some(row=>row.sourceId===cancelledPurchase.id),false)
  assert.equal(p.grossCents,10000);assert.equal(p.withheldCents,1000);assert.equal(p.paidCents,9000);assert.equal(p.documentGross,"100.00")
  const creditPurchaseRow=reconciliation.data.find(row=>row.sourceKind==="PURCHASE"&&row.sourceId===creditPurchase.id)!
  assert.equal(creditPurchaseRow.withheldCents,1000);assert.equal(creditPurchaseRow.balanceCents,9000)
  const receivedPurchase=reconciliation.data.find(row=>row.sourceKind==="PURCHASE"&&row.sourceId===purchase.id)!
  assert.equal(receivedPurchase.grossCents,10000);assert.equal(Number(receivedPurchase.documentGross),99)
  const exp=reconciliation.data.find(row=>row.sourceKind==="EXPENSE"&&row.sourceId===expense.id)!
  assert.equal(exp.grossCents,10000);assert.equal(exp.paidCents,3000);assert.equal(exp.balanceCents,7000)
  const debit=reconciliation.data.find(row=>row.type==="E33")!, credit=reconciliation.data.find(row=>row.type==="E34")!
  assert.equal(debit.adjustmentCents,2000);assert.equal(debit.paidCents,500);assert.equal(debit.balanceCents,1500)
  assert.equal(credit.adjustmentCents,-1000);assert.equal(credit.paidCents,-400);assert.equal(reconciliation.data.filter(row=>row.sourceKind==="RETURN").length,0)
  const ap=reconciliation.data.find(row=>row.sourceKind==="PAYABLE"&&row.sourceId===payable.id)!, foreignDoc=reconciliation.data.find(row=>row.sourceKind==="SUPPLIER_PAYMENT"&&row.sourceId===payment.id)!
  assert.equal(ap.grossCents,10000);assert.equal(ap.paidCents,9000);assert.equal(foreignDoc.grossCents,null);assert.equal(foreignDoc.paidCents,null)
  const page1=await fiscalReport(owner,"documents",new URLSearchParams({take:"2"}));assert.equal(page1.data.length,2);assert.ok(page1.nextCursor)
  const page2=await fiscalReport(owner,"documents",new URLSearchParams({take:"2",cursor:page1.nextCursor!}));assert.ok(page2.data.every(row=>!page1.data.some(prev=>prev.id===row.id)))
  assert.match(reportCsvRow(["=2+2"]),/^"'=2\+2"/)
  assert.match(reportCsvRow([-100]),/^"-100"/)
  response=await reports.GET(req("/api/fiscal/reports/documents?format=csv",h),reportContext("documents"));assert.equal(response.status,200);const csv=await response.text();assert.match(csv,/Informe administrativo interno/);assert.match(csv,/Producto original/)
  response=await reports.GET(req("/api/fiscal/reports/reconciliation",limitedH),reportContext("reconciliation"));assert.equal(response.status,403)
  response=await reports.GET(req("/api/fiscal/reports/reconciliation?take=200",salesH),reportContext("reconciliation"));assert.equal(response.status,200);const salesOnly=await response.json();assert.ok(salesOnly.data.length>0);assert.ok(salesOnly.data.every((row:{sourceKind:string})=>["SALE","ADJUSTMENT","RETURN"].includes(row.sourceKind)))
  await db.fiscalSettings.update({where:{accountId:account.id},data:{enabled:false}})
  assert.equal((await getReceivedDocument(owner,created.id)).revision,2)
  await cashRequest.run({trustedActor:owner,deviceHash:""},async()=>{const ordinary=await createStandalonePayable(owner,{supplierId:supplier.id,description:"Servicio ordinario",totalCents:5000,dueDate:"2099-12-31",operationId:`ordinary-${suffix}`});assert.equal(ordinary.balanceCents,5000)})
})
