import { test } from "node:test"
import assert from "node:assert/strict"
import type { Prisma } from "@prisma/client"

const { previewFiscalSale } = await import("../src/lib/fiscal/core/sale-preview")
const { parseFiscalSaleCommand } = await import("../src/lib/fiscal/core/sale-command")
const actor = { id: "owner", accountId: "a", isOwner: true }
const settings = { enabled:true,jurisdiction:"DO",regime:"DO_ECF",environment:"TEST",configurationStatus:"VALIDATED",version:1,effectiveFrom:new Date("2026-11-09T00:00:00Z"),legalName:"Emisor",taxId:"123456789" }
const generic = { id:"generic",name:"Cliente General",isGeneric:true,isActive:true,cedula:null,fiscalIdentification:null,fiscalIdentificationCountry:null,fiscalLegalName:null,saleDiscountPercentBp:0,creditDays:0 }
const named = { ...generic,id:"buyer",name:"Comprador",isGeneric:false,fiscalIdentification:"101111111",fiscalIdentificationCountry:"DO",fiscalLegalName:"Comprador",creditDays:30 }
const product = { id:"p",accountId:"a",name:"Producto",priceCents:11800,itbisRateBp:1800,fiscalItemType:"BIEN",fiscalUnit:"UNIDAD",fiscalTaxTreatment:"GRAVADO" }
const input = { type:"CONTADO",customerId:null,paymentMethod:"EFECTIVO",items:[{productId:"p",qty:1,unitPriceCents:11800}],applyLegalTip:false,salePricesIncludeItbis:true,soldAt:"2026-11-10T12:00:00Z",fiscal:{type:"E32",expectedPolicyVersion:1} }
function fixture(active = true) {
  return { fiscalSettings:{findUnique:async()=>({...settings,enabled:active})},companySettings:{findFirst:async()=>({salePricesIncludeItbis:true,legalTipEnabled:true})},customer:{findFirst:async({where}:any)=>where.id === "buyer" ? named : generic},product:{findMany:async()=>[product]},$queryRaw:async()=>[] } as unknown as Prisma.TransactionClient
}

test("E32 calcula desde la venta, valida el umbral y acepta comprador extranjero", async () => {
  const result=await previewFiscalSale(actor,input,fixture());assert.equal(result.totals.gross,"118.00");assert.equal(result.totals.tax,"18.00")
  const high={...input,items:[{...input.items[0],unitPriceCents:25000000}]}
  await assert.rejects(previewFiscalSale(actor,high,fixture()),(e:any)=>e.issues?.[0]?.field==="buyer")
  const foreign=await previewFiscalSale(actor,{...high,fiscal:{...input.fiscal,buyer:{name:"Visitante",identification:"PASS123",country:"US"}}},fixture());assert.equal(foreign.buyer?.country,"US")
  await assert.rejects(previewFiscalSale(actor,input,fixture(false)),(e:any)=>e.code==="PROFILE_UNAVAILABLE")
})

test("E31 conserva comprador, pagos y propina de la operación", async () => {
  const result=await previewFiscalSale(actor,{...input,customerId:"buyer",applyLegalTip:true,fiscal:{type:"E31",expectedPolicyVersion:1}},fixture())
  assert.equal(result.buyer?.id,"buyer");assert.equal(result.totals.gross,"128.00")
  assert.equal(result.totals.bases.EXENTO,"0.00");assert.equal(result.totals.additionalTaxes?.[0].amount,"10.00")
  assert.equal(result.sale.payments[0].code,"1")
})

test("comandos solo aceptan datos declarativos y rechazan valores inventados", () => {
  assert.throws(()=>parseFiscalSaleCommand({type:"E31",expectedPolicyVersion:1,totals:{gross:"1"}}))
  assert.throws(()=>parseFiscalSaleCommand({type:"E46",expectedPolicyVersion:1,currency:"USD",special:{exportMode:"EXPORTACION",destinationCountry:"US"}}))
})

test("RNC del cliente general selecciona la ficha existente sin cambiar su identidad fiscal", async () => {
  const db = fixture() as any
  const row={id:"buyer",visualId:2,name:"Comprador",fiscalLegalName:"Comprador",fiscalIdentification:"101111111",fiscalIdentificationType:"RNC",fiscalIdentificationCountry:"DO",fiscalPreferredReceiptType:"E31",cedula:null,saleDiscountPercentBp:0}
  db.$queryRaw=async()=>[row]
  const result=await previewFiscalSale(actor,{...input,fiscal:{type:"E31",expectedPolicyVersion:1,buyer:{name:"Nombre temporal",identification:"101-11111-1",country:"DO"}}},db)
  assert.equal(result.buyer?.id,"buyer");assert.equal(result.buyer?.name,"Comprador");assert.equal(result.sale.customerId,"buyer")
  db.$queryRaw=async()=>[row,{...row,id:"buyer2"}]
  await assert.rejects(previewFiscalSale(actor,{...input,fiscal:{type:"E31",expectedPolicyVersion:1,buyer:{name:"Temporal",identification:"101111111",country:"DO"}}},db),(e:any)=>e.issues?.[0]?.field==="fiscal.buyer.identification")
})
