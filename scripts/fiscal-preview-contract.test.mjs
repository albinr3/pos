import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import ts from 'typescript'
import { NextRequest } from 'next/server.js'
const require = createRequire(import.meta.url)
const cache = new Map()
let actor = { id:'user-a', accountId:'a', isOwner:true }
let policy = { jurisdiction:'DO', regime:'DO_ECF', version:1 }
let referenceRows = []
const db = {
  fiscalSettings: { findUnique: async () => ({legalName:'Emisor',taxId:'123456789'}) },
  customer: { findFirst: async ({where}) => where.accountId === 'a' && where.id === 'ca' ? {id:'ca'} : null },
  supplier: { findFirst: async () => null },
  product: { count: async () => 0 }, fiscalConcept: { count: async () => 0 },
  sale:{findFirst:async()=>null}, purchase:{findFirst:async()=>null}, return:{findFirst:async()=>null}, operatingExpense:{findFirst:async()=>null},
  $queryRaw: async () => referenceRows,
}
const mocks = { '@/lib/db':{prisma:db}, '@/lib/permissions':{hasPermission:(user,key)=>!!(user.isOwner || user[key])}, './policy':{resolveFiscalPolicy:async()=>policy}, '../../../_helpers/auth':{getCurrentUserFromRequest:async()=>actor} }
function compile(path) {
  if (cache.has(path)) return cache.get(path)
  const source=fs.readFileSync(path,'utf8')
  const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const exports={}; cache.set(path,exports)
  vm.runInNewContext(out,{exports,crypto,console,Date,RegExp,Number,require:name=> name in mocks ? mocks[name] : name === '@/lib/fiscal/core/preview' ? compile('src/lib/fiscal/core/preview.ts') : name === '@/lib/fiscal/core/document' || name === './document' ? compile('src/lib/fiscal/core/document.ts') : name === '../profiles/do-ecf/rules' ? compile('src/lib/fiscal/profiles/do-ecf/rules.ts') : name === '../profiles/do-ecf/catalog' || name === './catalog' ? compile('src/lib/fiscal/profiles/do-ecf/catalog.ts') : name === './countries' ? compile('src/lib/fiscal/core/countries.ts') : require(name)}, {filename:path})
  return exports
}
const { POST } = compile('src/app/api/fiscal/documents/preview/route.ts')
const input = { type:'E31', issueDate:'2026-11-09', expectedPolicyVersion:1, issuer:{name:'Emisor',identification:'123456789',country:'DO'}, buyer:{id:'ca',name:'Cliente',identification:'101000001',country:'DO'}, incomeType:'01',payment:{type:'CONTADO'}, currency:{operation:'DOP',reporting:'DOP'}, lines:[{description:'Prueba',kind:'BIEN',unit:'UNIDAD',quantity:'1',unitPrice:'118',taxTreatment:'GRAVADO_18',priceIncludesTax:true}] }
const request = (body = input) => new NextRequest('http://localhost/api/fiscal/documents/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
test('previsualización autorizada calcula sin usar escrituras y es privada',async()=>{
  actor={id:'user-a',accountId:'a',isOwner:true}; policy={jurisdiction:'DO',regime:'DO_ECF',version:1}
  const res=await POST(request()); assert.equal(res.status,200); assert.equal(res.headers.get('cache-control'),'private, no-store'); const body=await res.json(); assert.equal(body.totals.gross,'118.00'); assert.equal(body.externalResult,null)
})
test('autenticación, permiso, perfil y referencias entre empresas',async()=>{
  actor=null; assert.equal((await POST(request())).status,401)
  actor={id:'user',accountId:'a'}; assert.equal((await POST(request())).status,403)
  actor={id:'owner',accountId:'a',isOwner:true}; policy={jurisdiction:null,regime:null,version:1}; assert.equal((await POST(request())).status,409)
  policy={jurisdiction:'DO',regime:'DO_ECF',version:1}; actor={id:'owner-b',accountId:'b',isOwner:true}; assert.equal((await POST(request())).status,404)
})
test('errores de campo, campos prohibidos y versión',async()=>{
  actor={id:'user-a',accountId:'a',isOwner:true}; policy={jurisdiction:'DO',regime:'DO_ECF',version:1}
  let res=await POST(request({...input,expectedPolicyVersion:2})); assert.equal(res.status,409)
  res=await POST(request({...input,totals:{gross:'0'}})); assert.equal(res.status,400)
  res=await POST(request({...input,lines:[{...input.lines[0],quantity:'1.001'}]})); assert.equal(res.status,422); assert.equal((await res.json()).error.fields[0].field,'lines.0.quantity')
})
test('E34 se limita a la copia original y conserva la moneda de la referencia',async()=>{
  actor={id:'user-a',accountId:'a',isOwner:true}; policy={jurisdiction:'DO',regime:'DO_ECF',version:1}
  referenceRows=[{state:'PREPARADO_PENDIENTE_CONEXION',type:'E31',snapshot:{issueDate:'2026-11-09',buyer:{identification:'101000001',country:'DO'},currency:{operation:'DOP'},totals:{gross:'118.00'},lines:[{...input.lines[0],gross:'118.00'}]}}]
  const note={...input,type:'E34',issueDate:'2026-12-10',lines:[{...input.lines[0],originalLine:1}],reference:{documentId:'ref',issueDate:'2026-11-09',modificationCode:'3'}}
  let res=await POST(request(note)); assert.equal(res.status,200); const result=await res.json(); assert.equal(result.totals.net,'100.00'); assert.ok(result.warnings.some(w=>w.includes('saldo pendiente')))
  res=await POST(request({...note,reference:{...note.reference,modificationCode:'1'}})); assert.equal(res.status,200); assert.ok((await res.json()).warnings.some(w=>w.includes('coincida con el saldo pendiente')))
  res=await POST(request({...note,lines:[{...note.lines[0],unitPrice:'118.01'}]})); assert.equal(res.status,422); assert.equal((await res.json()).error.fields[0].field,'lines')
  for (const line of [{...note.lines[0],taxTreatment:'EXENTO'}, {...note.lines[0],originalLine:undefined}, {...note.lines[0],quantity:'0.5',unitPrice:'117'}, {...note.lines[0],quantity:'1.01',discount:'2.00'}]) {
    res=await POST(request({...note,lines:[line]})); assert.equal(res.status,422); assert.equal((await res.json()).error.fields[0].field,'lines.0.originalLine')
  }
  res=await POST(request({...note,lines:[{...note.lines[0],quantity:'0.5'},{...note.lines[0],quantity:'0.5'}]})); assert.equal(res.status,422)
  referenceRows[0].snapshot.lines[0].gross='100.00'
  res=await POST(request({...note,lines:[{...note.lines[0],quantity:'0.5'}]})); assert.equal(res.status,422)
  referenceRows[0].snapshot.lines[0].gross='118.00'
  referenceRows[0].snapshot.currency.operation='USD'; res=await POST(request(note)); assert.equal(res.status,422)
  referenceRows[0].type='E34'; res=await POST(request(note)); assert.equal(res.status,422)
  referenceRows=[]
})
test('notas sobre E32 comprueban el comprador según el total original en DOP',async()=>{
  actor={id:'user-a',accountId:'a',isOwner:true}; policy={jurisdiction:'DO',regime:'DO_ECF',version:1}
  referenceRows=[{state:'PREPARADO_PENDIENTE_CONEXION',type:'E32',snapshot:{issueDate:'2026-11-09',buyer:null,currency:{operation:'USD'},reportingTotals:{gross:'250000.00'}}}]
  const note={...input,type:'E33',buyer:undefined,reference:{documentId:'ref',issueDate:'2026-11-09',modificationCode:'3'}}
  let res=await POST(request(note)); assert.equal(res.status,422); assert.equal((await res.json()).error.fields[0].field,'buyer')
  referenceRows[0].snapshot.reportingTotals.gross='249999.99'; res=await POST(request(note)); assert.equal(res.status,200)
  referenceRows[0].snapshot.reportingTotals.gross='250000.00'; referenceRows[0].snapshot.buyer={name:'Cliente',identification:'101000001',country:'DO'}
  res=await POST(request({...note,buyer:input.buyer})); assert.equal(res.status,200)
  delete referenceRows[0].snapshot.reportingTotals; res=await POST(request({...note,buyer:input.buyer})); assert.equal(res.status,422)
  referenceRows=[]
})
