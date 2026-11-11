import { Prisma } from "@prisma/client"
import { Decimal } from "@prisma/client/runtime/library"
import { prisma } from "@/lib/db"
import { cashRequest, withCashOperation, type CashOperationInput } from "@/lib/cash-context"
import { hasPermission } from "@/lib/permissions"
import { createSupplierPaymentInTransaction, pageInput } from "@/lib/accounts-payable"
import { dateOnly, lockPurchaseAccount, moneyCents, purchaseOperation, purchasePermit, PurchaseError, type PurchaseActor } from "@/lib/purchase-credit"

type ForeignLine = { description: string; kind: "SERVICIO"; amountCents: number; isrRate: string }
type PaidLine = ForeignLine & { index: number; withheldCents: number }
type PaidSnapshot = { lines: PaidLine[]; grossCents: number; withheldCents: number; grossDopCents: number; withheldDopCents: number; netDopCents: number }
type ForeignInput = { operationId: string; expectedPolicyVersion: number; supplierId: string; description: string; dueDate: string; currency: string; rate?: string; rateDate?: string; declaredDominicanSource: boolean; supportReference?: string; lines: ForeignLine[] }
type PaymentInput = { operationId: string; foreignOperationId?: string; expectedPolicyVersion: number; expectedNetDopCents: number; allocations: Array<{ index: number; amountCents: number }>; method: string; treasuryAccountId: string; note?: string; cashOperation?: CashOperationInput }
const fail = (message: string, code = "INVALID_INPUT", status = 400): never => { throw new PurchaseError(code, message, status) }
function fields(value: unknown, allowed: string[], field: string) {
 if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).some(key=>!allowed.includes(key))) fail(`Campos no admitidos en ${field}`)
}
function string(value: unknown, field: string, max = 200) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) return fail(`Indica ${field} válido`); return value.trim() }
function rate(value: unknown, field: string, maximum?: number) {
 if(typeof value !== "string" || !/^\d{1,10}(?:\.\d{1,4})?$/.test(value)) return fail(`Indica ${field} con hasta cuatro decimales`)
 const result = new Decimal(value)
 if(result.lte(0) || (maximum !== undefined && result.gt(maximum))) return fail(`${field} fuera de rango`)
 return result
}
const integer = (n: Decimal) => n.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
const withheld = (cents: number, percentage: string) => integer(new Decimal(cents).mul(percentage).div(100))
const convert = (cents: number, exchange: Decimal) => integer(new Decimal(cents).mul(exchange))
function checkTotal(value: number) { if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) fail("El importe queda fuera del rango permitido", "INVALID_AMOUNT"); return value }
function normalizeLines(input: ForeignLine[]) {
 if(!Array.isArray(input) || !input.length || input.length>100) return fail("Indica entre uno y cien servicios")
 return input.map(line=>{
  fields(line,["description","kind","amountCents","isrRate"],"el concepto")
  // Un proveedor extranjero no convierte una importación de bienes en un servicio E47.
  if(line?.kind!=="SERVICIO") return fail("E47 admite únicamente conceptos de servicios")
  return { description:string(line.description,"el concepto"), kind:"SERVICIO" as const, amountCents:moneyCents(line.amountCents), isrRate:rate(line.isrRate,"la tasa ISR",100).toFixed(4) }
 })
}
function totals(lines: ForeignLine[], exchange: Decimal) {
 const gross=lines.reduce((sum,line)=>sum+line.amountCents,0)
 const tax=lines.reduce((sum,line)=>sum+withheld(line.amountCents,line.isrRate),0)
 checkTotal(gross); const grossDopCents=checkTotal(convert(gross,exchange)), withheldDopCents=convert(tax,exchange), netDopCents=grossDopCents-withheldDopCents
 checkTotal(netDopCents)
 return { grossCents:gross,withheldCents:tax,grossDopCents,withheldDopCents,netDopCents }
}
async function policy(tx: Prisma.TransactionClient, actor: PurchaseActor, version: number) {
 const settings=await tx.fiscalSettings.findUnique({where:{accountId:actor.accountId}})
 if(!settings?.enabled || settings.jurisdiction!=="DO" || settings.regime!=="DO_ECF" || settings.environment!=="TEST" || settings.configurationStatus!=="VALIDATED" || settings.version!==version) fail("Activa una configuración fiscal de prueba válida y actualizada","FISCAL_POLICY_CHANGED",409)
}
export async function createForeignObligation(actor: PurchaseActor, input: ForeignInput) {
 purchasePermit(actor,"canManagePurchases"); purchasePermit(actor,"canAccessAccountsPayable")
 fields(input,["operationId","expectedPolicyVersion","supplierId","description","dueDate","currency","rate","rateDate","declaredDominicanSource","supportReference","lines"],"la obligación")
 const supplierId=string(input?.supplierId,"el proveedor",100), description=string(input?.description,"la descripción")
 const dueDate=dateOnly(input.dueDate), currency=string(input.currency,"la moneda",3).toUpperCase()
 if(!/^[A-Z]{3}$/.test(currency)) fail("Usa un código de moneda de tres letras")
 if(input.declaredDominicanSource!==true) fail("Declara la renta gravada de fuente dominicana y revisa su elegibilidad")
 const exchange=currency==="DOP" ? new Decimal(1) : rate(input.rate,"la tasa de cambio")
 if(currency==="DOP" && (input.rate !== undefined || input.rateDate !== undefined)) fail("DOP no necesita tasa de cambio")
 const rateDate=currency==="DOP" ? null : dateOnly(input.rateDate)
 const lines=normalizeLines(input.lines), total=totals(lines,exchange)
 const supportReference=input.supportReference ? string(input.supportReference,"el soporte",500) : null
 return prisma.$transaction(async tx=>{
  await lockPurchaseAccount(tx,actor.accountId)
  return purchaseOperation(tx,actor,"foreignObligation",input.operationId,input,async()=>{
   await policy(tx,actor,input.expectedPolicyVersion)
   const supplier=await tx.supplier.findFirst({where:{id:supplierId,accountId:actor.accountId,isActive:true}})
   if(!supplier?.fiscalIdentification || !supplier.fiscalIdentificationCountry || supplier.fiscalIdentificationCountry==="DO" || !supplier.fiscalResidence || supplier.fiscalResidence==="DO") return fail("Completa identificación extranjera y residencia fiscal no dominicana del beneficiario","INVALID_SUPPLIER")
   const party={id:supplier.id,name:supplier.fiscalLegalName || supplier.name,identification:supplier.fiscalIdentification,country:supplier.fiscalIdentificationCountry,residence:supplier.fiscalResidence}
   const ap=await tx.accountPayable.create({data:{accountId:actor.accountId,supplierId,description,notes:supportReference,totalCents:total.netDopCents,balanceCents:total.netDopCents,dueDate}})
   const operation=await tx.fiscalForeignOperation.create({data:{accountId:actor.accountId,payableId:ap.id,currency,rate:exchange,rateDate,lines:lines as Prisma.InputJsonValue,supplierSnapshot:party,grossForeignCents:total.grossCents,expectedWithheldForeignCents:total.withheldCents,grossDopCents:total.grossDopCents,expectedWithheldDopCents:total.withheldDopCents,originalNetCents:total.netDopCents}})
   await tx.auditLog.create({data:{accountId:actor.accountId,userId:actor.id,action:"PURCHASE_CREATED",resourceType:"FiscalForeignOperation",resourceId:operation.id,details:{payableId:ap.id,currency,netDopCents:total.netDopCents}}})
   return {id:operation.id,payableId:ap.id,currency,rate:exchange.toFixed(4),rateDate:rateDate?.toISOString().slice(0,10) ?? null,lines,...total,balanceCents:ap.balanceCents}
  })
 })
}
function allocate(lines: ForeignLine[], prior: PaidSnapshot[], requested: PaymentInput["allocations"], exchange: Decimal): PaidSnapshot {
 if(!Array.isArray(requested) || !requested.length || requested.length>lines.length) return fail("Indica los conceptos de este abono")
 const used=new Set<number>()
 const allocated: PaidLine[] = requested.map(item=>{
  fields(item,["index","amountCents"],"la asignación")
  if(!Number.isSafeInteger(item.index) || item.index<0 || item.index>=lines.length || used.has(item.index)) return fail("El concepto de pago es inválido o está repetido")
  used.add(item.index)
  const line=lines[item.index], amountCents=moneyCents(item.amountCents)
  const old=prior.flatMap(p=>p.lines).filter(p=>p.index===item.index)
  const paid=old.reduce((sum,p)=>sum+p.amountCents,0), retained=old.reduce((sum,p)=>sum+p.withheldCents,0)
  if(paid+amountCents>line.amountCents) return fail("El abono supera la base pendiente del concepto","PAYMENT_EXCEEDS_BALANCE",409)
  // Redondear el ISR acumulado evita perder o duplicar centavos al dividir un concepto en abonos.
  const withheldCents=withheld(paid+amountCents,line.isrRate)-retained
  return {index:item.index,description:line.description,kind:line.kind,amountCents,isrRate:line.isrRate,withheldCents}
 })
 const grossCents=allocated.reduce((sum,line)=>sum+line.amountCents,0), withheldCents=allocated.reduce((sum,line)=>sum+line.withheldCents,0)
 const grossDopCents=convert(grossCents,exchange), withheldDopCents=convert(withheldCents,exchange), netDopCents=grossDopCents-withheldDopCents
 checkTotal(netDopCents)
 return {lines:allocated,grossCents,withheldCents,grossDopCents,withheldDopCents,netDopCents}
}
export async function listForeignObligations(actor: PurchaseActor, pagination: {skip?:number;take?:number} = {}) {
 purchasePermit(actor,"canAccessAccountsPayable")
 const {skip,take}=pageInput(pagination)
 const rows=await prisma.fiscalForeignOperation.findMany({where:{accountId:actor.accountId},include:{payable:{include:{supplier:{select:{name:true}}}},payments:{include:{supplierPayment:{select:{id:true,paidAt:true,cancelledAt:true,amountCents:true}}}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take:take+1})
 return {data:rows.slice(0,take).map(row=>({...row,rate:row.rate.toFixed(4),rateDate:row.rateDate?.toISOString().slice(0,10) ?? null})),nextSkip:rows.length>take?skip+take:null}
}
export async function getForeignObligation(actor: PurchaseActor, id: string) {
 purchasePermit(actor,"canAccessAccountsPayable")
 const row=await prisma.fiscalForeignOperation.findFirst({where:{id,accountId:actor.accountId},include:{payable:{include:{supplier:true}},payments:{include:{supplierPayment:{include:{fiscalDocuments:{select:{id:true,state:true,type:true,revision:true}}}}},orderBy:{createdAt:"asc"}}}})
 if(!row) return fail("Obligación al exterior no encontrada","NOT_FOUND",404)
 const lines=row.lines as ForeignLine[]
 const paid=row.payments.filter(p=>!p.supplierPayment.cancelledAt).map(p=>p.snapshot as PaidSnapshot)
 const documented=row.payments.filter(p=>!p.supplierPayment.cancelledAt && p.supplierPayment.fiscalDocuments.some(doc=>doc.type==="E47" && doc.state==="PREPARADO_PENDIENTE_CONEXION")).map(p=>p.snapshot as PaidSnapshot)
 const available=lines.map((line,index)=>({ ...line,index,remainingCents:line.amountCents-paid.flatMap(p=>p.lines).filter(p=>p.index===index).reduce((n,p)=>n+p.amountCents,0),documentedCents:documented.flatMap(p=>p.lines).filter(p=>p.index===index).reduce((n,p)=>n+p.amountCents,0) }))
 const canSeeDocuments=hasPermission(actor,"canViewFiscalDocuments") || hasPermission(actor,"canPrepareFiscalDocuments")
 const payments=row.payments.map(payment=>({...payment,supplierPayment:{...payment.supplierPayment,fiscalDocuments:canSeeDocuments ? payment.supplierPayment.fiscalDocuments : []}}))
 return {...row,payments,rate:row.rate.toFixed(4),rateDate:row.rateDate?.toISOString().slice(0,10) ?? null,available}
}
export async function previewForeignPayment(actor: PurchaseActor, id: string, requested: PaymentInput["allocations"]) {
 purchasePermit(actor,"canRegisterSupplierPayments"); purchasePermit(actor,"canAccessAccountsPayable")
 const operation=await prisma.fiscalForeignOperation.findFirst({where:{id,accountId:actor.accountId},include:{payable:true,payments:{include:{supplierPayment:true}}}})
 if(!operation) return fail("Obligación al exterior no encontrada","NOT_FOUND",404)
 const lines=operation.lines as ForeignLine[]
 const prior=operation.payments.filter(p=>!p.supplierPayment.cancelledAt).map(p=>p.snapshot as PaidSnapshot)
 const preview=allocate(lines,prior,requested,operation.rate)
 const all=prior.flatMap(p=>p.lines).concat(preview.lines)
 const final=lines.every((line,index)=>all.filter(p=>p.index===index).reduce((n,p)=>n+p.amountCents,0)===line.amountCents)
 const roundingCents=final ? preview.netDopCents-operation.payable.balanceCents : 0
 if(!final && preview.netDopCents>operation.payable.balanceCents) return fail("El abono supera el saldo en DOP","PAYMENT_EXCEEDS_BALANCE",409)
 return {...preview,currency:operation.currency,rate:operation.rate.toFixed(4),rateDate:operation.rateDate?.toISOString().slice(0,10) ?? null,roundingCents}
}
export async function addForeignPayment(actor: PurchaseActor, id: string, input: PaymentInput) {
 purchasePermit(actor,"canRegisterSupplierPayments"); purchasePermit(actor,"canAccessAccountsPayable")
 if(!input || typeof input!=="object" || Array.isArray(input)) return fail("Datos de pago inválidos")
 fields(input,["operationId","foreignOperationId","expectedPolicyVersion","expectedNetDopCents","allocations","method","treasuryAccountId","note","cashOperation"],"el pago")
 if ("foreignOperationId" in input && input.foreignOperationId !== id) return fail("La operación indicada no coincide con la ruta")
 return cashRequest.run({...cashRequest.getStore(),trustedActor:actor,fiscalSupplierPaymentRequested:true},()=>withCashOperation(input.cashOperation,{kind:"foreignPayment",id,...input},()=>prisma.$transaction(async tx=>{
  await lockPurchaseAccount(tx,actor.accountId)
  return purchaseOperation(tx,actor,"foreignPayment",input.operationId,{id,...input},async()=>{
   await policy(tx,actor,input.expectedPolicyVersion)
   const operation=await tx.fiscalForeignOperation.findFirst({where:{id,accountId:actor.accountId},include:{payable:true,payments:{include:{supplierPayment:true}}}})
   if(!operation) return fail("Obligación al exterior no encontrada","NOT_FOUND",404)
   const lines=operation.lines as ForeignLine[]
   const prior=operation.payments.filter(p=>!p.supplierPayment.cancelledAt).map(p=>p.snapshot as PaidSnapshot)
   const allocation=allocate(lines,prior,input.allocations,operation.rate)
   if(!Number.isSafeInteger(input.expectedNetDopCents) || input.expectedNetDopCents!==allocation.netDopCents) fail("El importe cambió; vuelve a revisar el pago","VERSION_CONFLICT",409)
   const all=prior.flatMap(p=>p.lines).concat(allocation.lines)
   const final=lines.every((line,index)=>all.filter(p=>p.index===index).reduce((n,p)=>n+p.amountCents,0)===line.amountCents)
   const difference=final ? allocation.netDopCents-operation.payable.balanceCents : 0
   if(!final && allocation.netDopCents>operation.payable.balanceCents) fail("El abono supera el saldo en DOP","PAYMENT_EXCEEDS_BALANCE",409)
   if(final && Math.abs(difference)>operation.payments.length+1) fail("La diferencia acumulada de redondeo requiere revisión","ROUNDING_CONFLICT",409)
   if(difference) {
    // La diferencia de centavos proviene de convertir cada abono por separado; conservarla explícitamente.
    await tx.accountPayable.update({where:{id:operation.payableId},data:{totalCents:{increment:difference},balanceCents:{increment:difference}}})
   }
   const context=cashRequest.getStore()
   if(!context || context.trustedActor?.id!==actor.id) return fail("Inicia sesión","UNAUTHENTICATED",401)
   context.fiscalForeignPaymentAuthorizedAccountId=actor.accountId
   const payment=await createSupplierPaymentInTransaction(tx,actor,{apId:operation.payableId,amountCents:allocation.netDopCents,method:input.method,treasuryAccountId:input.treasuryAccountId,note:input.note})
   await tx.fiscalForeignPayment.create({data:{accountId:actor.accountId,foreignOperationId:operation.id,supplierPaymentId:payment.id,snapshot:allocation as unknown as Prisma.InputJsonValue,roundingCents:difference}})
   // La retención nace con el pago y no representa otra salida al beneficiario.
   await tx.accountPayable.update({where:{id:operation.payableId},data:{withheldIsrCents:{increment:allocation.withheldDopCents}}})
   return {id:payment.id,foreignOperationId:id,payableId:operation.payableId,newBalanceCents:payment.newBalanceCents,roundingCents:difference,...allocation}
  })
 })))
}
