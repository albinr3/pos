import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createRequire } from "node:module"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
const require=createRequire(import.meta.url)
function load(file) {
 const source=fs.readFileSync(file,"utf8")
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const exports={}
 vm.runInNewContext(js,{exports,Date,console,require(name){
  if(name==="react"||name==="react/jsx-runtime")return require(name)
  if(name==="next/link")return {__esModule:true,default:({children,...props})=>React.createElement("a",props,children)}
  if(name==="@/lib/cash-offline")return {}
  if(name==="@/components/app/fiscal-document-preview")return {FiscalDocumentPreview:()=>null}
  if(name==="@/components/app/fiscal-source-link")return {FiscalSourceLink:()=>null,useFiscalSourceAccess:()=>false}
  if(name==="../treasury/actions")return {listTreasuryAccounts:async()=>[]}
  throw Error(`Dependencia no prevista: ${name}`)
 }})
 return exports
}
const Expense=load("src/app/(app)/operating-expenses/fiscal-expenses.tsx").FiscalExpenses
const Foreign=load("src/app/(app)/ap/foreign-payments.tsx").ForeignPayments
const actor={id:"user",accountId:"account"}
test("gastos: el formulario activo explica origen, elegibilidad y reembolso",()=>{
 const html=renderToStaticMarkup(React.createElement(Expense,{actor,enabled:true,version:1,canPrepare:true}))
 assert.match(html,/Registrar gasto/);assert.match(html,/Adelanto personal/);assert.match(html,/Caja chica/);assert.match(html,/elegible para revisión E43/)
 const disabled=renderToStaticMarkup(React.createElement(Expense,{actor,enabled:false,version:1,canPrepare:true}))
 assert.doesNotMatch(disabled,/Registrar gasto/);assert.match(disabled,/Gastos del personal y reembolsos/)
})
test("pagos al exterior: informa moneda, tasa y condición del beneficiario",()=>{
 const html=renderToStaticMarkup(React.createElement(Foreign,{actor,enabled:true,version:1,canCreate:true,canPay:true,canPrepare:true}))
 assert.match(html,/Registrar obligación al exterior/);assert.match(html,/Beneficiario no residente/);assert.match(html,/liquidan en DOP/);assert.match(html,/ISR % aplicable/)
 const disabled=renderToStaticMarkup(React.createElement(Foreign,{actor,enabled:false,version:1,canCreate:true,canPay:true,canPrepare:true}))
 assert.doesNotMatch(disabled,/Registrar obligación al exterior/);assert.match(disabled,/Obligaciones al exterior/)
})
