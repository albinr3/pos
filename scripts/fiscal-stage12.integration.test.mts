import { test, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { PrismaClient } from "@prisma/client"
const require=createRequire(import.meta.url)
require.cache[require.resolve("next/cache")]={exports:{revalidatePath(){}}} as NodeModule
const { cashRequest } = await import("../src/lib/cash-context")
const { createFiscalExpense, createExpenseSettlement, listExpenseSettlements, updateFiscalExpenseDetails } = await import("../src/lib/fiscal/core/employee-expenses")
const { getE43Template } = await import("../src/lib/fiscal/core/expense-document")
const { createFiscalDraft, prepareFiscalDraft } = await import("../src/lib/fiscal/core/preparation")
const { createOperatingExpense } = await import("../src/app/(app)/operating-expenses/actions")
const { documentLegs } = await import("../src/lib/cash-money")
const url=new URL(process.env.TEST_DATABASE_URL ?? "")
if (!["localhost","127.0.0.1"].includes(url.hostname) || url.port!=="55439" || !/^\/cash_test_stage(?:12|13)_\d+$/.test(url.pathname)) throw Error("Se requiere una base fiscal local aislada")
const db=new PrismaClient({datasources:{db:{url:url.toString()}}})
after(async()=>db.$disconnect())
test("gasto E43, reembolso idempotente y gasto ordinario con fiscal apagado",async()=>{
 const tx=db
 {
  const suffix=randomUUID(), account=await tx.account.create({data:{name:"Etapa 12",clerkUserId:`test-${suffix}`}})
  const owner=await tx.user.create({data:{accountId:account.id,name:"Prueba",username:`u-${suffix}`,passwordHash:"test",isOwner:true}})
  const treasury=await tx.treasuryAccount.create({data:{accountId:account.id,name:"Caja",type:"CAJA",currency:"DOP"}})
  await tx.fiscalSettings.create({data:{accountId:account.id,enabled:false,jurisdiction:"DO",regime:"DO_ECF",environment:"TEST",configurationStatus:"VALIDATED",version:1,legalName:"Empresa prueba",taxId:"123456789"}})
  // El flujo ordinario consulta tesorería por otra conexión; las fixtures deben estar confirmadas.
  await cashRequest.run({trustedActor:owner,deviceHash:""},async()=>{
   const ordinary=await createOperatingExpense({description:"Gasto ordinario",amountCents:800,treasuryAccountId:treasury.id,paymentMethod:"EFECTIVO"})
   assert.equal((await tx.operatingExpense.findUniqueOrThrow({where:{id:ordinary.id}})).amountCents,800)
   await tx.fiscalSettings.update({where:{accountId:account.id},data:{enabled:true}})
   await tx.fiscalSequence.create({data:{accountId:account.id,type:"E43",rangeStart:BigInt(1),rangeEnd:BigInt(50),lastNumber:BigInt(0),expiresOn:new Date("2099-12-31"),active:true}})
   const input={operationId:`expense-${suffix}`,expectedPolicyVersion:1,description:"Taxi",expenseDate:"2026-11-11",fundingSource:"EMPLOYEE" as const,employee:{name:"María"},supportReferences:["recibo 5"],eligibleMinorExpense:true,lines:[{description:"Taxi",kind:"SERVICIO" as const,amountCents:10000,taxTreatment:"EXENTO"}]}
   const expense=await createFiscalExpense(owner,input)
   assert.deepEqual(await createFiscalExpense(owner,input),expense)
   const stored=await tx.operatingExpense.findUniqueOrThrow({where:{id:expense.id}})
   assert.deepEqual(documentLegs("operatingExpense",stored),[])
   const settlement={operationId:`refund-${suffix}`,amountCents:3000,method:"EFECTIVO" as const,treasuryAccountId:treasury.id}
   const paid=await createExpenseSettlement(owner,expense.id,settlement)
   assert.deepEqual(await createExpenseSettlement(owner,expense.id,settlement),paid)
   assert.equal((await listExpenseSettlements(owner,expense.id)).balanceCents,7000)
   assert.equal(await tx.employeeExpenseSettlement.count({where:{expenseId:expense.id}}),1)
   assert.equal(documentLegs("employeeExpenseSettlement",await tx.employeeExpenseSettlement.findFirstOrThrow({where:{expenseId:expense.id}}))[0].amountCents,-3000)
   await assert.rejects(createExpenseSettlement(owner,expense.id,{...settlement,operationId:`excess-${suffix}`,amountCents:7001}),/supera el saldo/)
   const revision={operationId:`revision-${suffix}`,expectedPolicyVersion:1,expectedUpdatedAt:stored.updatedAt.toISOString(),employee:input.employee,eligibleMinorExpense:true,supportReferences:["recibo corregido"],lines:input.lines}
   const changed=await updateFiscalExpenseDetails(owner,expense.id,revision)
   assert.deepEqual(await updateFiscalExpenseDetails(owner,expense.id,revision),changed)
   assert.equal((await listExpenseSettlements(owner,expense.id)).balanceCents,7000)
   await assert.rejects(updateFiscalExpenseDetails(owner,expense.id,{...revision,operationId:`wrong-amount-${suffix}`,expectedUpdatedAt:changed.updatedAt,lines:[{...input.lines[0],amountCents:10001}]}),/conservar el importe/)
   const template=await getE43Template(owner,expense.id,tx)
   const draft=await createFiscalDraft(owner,{operationId:`draft-${suffix}`,document:template}) as {id:string}
   await assert.rejects(createFiscalDraft(owner,{operationId:`duplicate-draft-${suffix}`,document:template}),/ya tiene un documento/)
   const result=await prepareFiscalDraft(owner,draft.id,{operationId:`prepare-${suffix}`,expectedRevision:1})
   assert.deepEqual(await prepareFiscalDraft(owner,draft.id,{operationId:`prepare-${suffix}`,expectedRevision:1}),result)
   assert.equal(await tx.fiscalDocument.count({where:{expenseId:expense.id,state:"PREPARADO_PENDIENTE_CONEXION"}}),1)
   assert.equal(await tx.fiscalNumberAllocation.count({where:{documentId:draft.id}}),1)
   await assert.rejects(updateFiscalExpenseDetails(owner,expense.id,{...revision,operationId:`frozen-${suffix}`,expectedUpdatedAt:changed.updatedAt}),/E43 preparado/)
   const taxed=await createFiscalExpense(owner,{...input,operationId:`taxed-${suffix}`,lines:[{...input.lines[0],taxTreatment:"GRAVADO_18"}]})
   await assert.rejects(getE43Template(owner,taxed.id,tx),/incompatibles/)
   const retained=await createFiscalExpense(owner,{...input,operationId:`retained-${suffix}`,lines:[{...input.lines[0],withholdings:[{kind:"ISR",rate:"10"}]}]})
   await assert.rejects(getE43Template(owner,retained.id,tx),/incompatibles/)
   await tx.fiscalSettings.update({where:{accountId:account.id},data:{enabled:false}})
   await assert.rejects(tx.operatingExpense.update({where:{id:expense.id},data:{amountCents:1}}),/protegid/i)
   const afterDisable=await createExpenseSettlement(owner,expense.id,{...settlement,operationId:`refund-after-disable-${suffix}`,amountCents:1000})
   assert.equal(afterDisable.balanceCents,6000)
  })
 }
})
