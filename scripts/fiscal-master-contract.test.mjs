import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import ts from 'typescript'
import { NextRequest } from 'next/server.js'
import * as master from '../src/lib/fiscal/core/master-data.ts'
const require = createRequire(import.meta.url)
const compile = (path, dependencies) => {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(output, { exports, crypto, console, Error, require: name => name in dependencies ? dependencies[name] : require(name) })
  return exports
}
let actor = { id: 'owner-a', accountId: 'a', isOwner: true }
const records = []
const table = {
  findFirst: async ({ where }) => records.find(x => x.id === where.id && x.accountId === where.accountId && x.isActive === where.isActive) ?? null,
  findMany: async ({ where, take, cursor }) => { let rows = records.filter(x => x.accountId === where.accountId && x.isActive).sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)); if (cursor) rows = rows.slice(rows.findIndex(x=>x.id === cursor.id) + 1); return take ? rows.slice(0,take) : rows },
  create: async ({ data }) => { const item = { id: `c${records.length+1}`, ...data, isActive:true, fiscalUnit:null, fiscalTaxTreatment:null, ...data }; records.push(item); return item },
  updateMany: async ({ where, data }) => { const item = records.find(x => x.id === where.id && x.accountId === where.accountId && x.isActive === where.isActive); if (!item) return {count:0}; Object.assign(item,data); return {count:1} },
}
const db = { fiscalConcept: table }
const permissions = { hasPermission: (user, key) => !!user && (user.isOwner || !!user[key]) }
const concepts = compile('src/lib/fiscal/core/concepts.ts', {'@/lib/db': {prisma:db}, '@/lib/permissions': permissions, './master-data':master})
const shared = compile('src/app/api/fiscal/concepts/_shared.ts', {'@/lib/fiscal/core/concepts': concepts, '@/lib/fiscal/core/master-data': master})
const base = { '../../_helpers/auth': {getCurrentUserFromRequest: async () => actor}, '../../../_helpers/auth': {getCurrentUserFromRequest: async () => actor}, '@/lib/fiscal/core/concepts': concepts, '@/lib/fiscal/core/master-data': master, './_shared': shared, '../_shared': shared }
const collection = compile('src/app/api/fiscal/concepts/route.ts',base)
const detail = compile('src/app/api/fiscal/concepts/[id]/route.ts',base)
const req = (method, body, query='') => new NextRequest(`http://localhost/api/fiscal/concepts${query}`, { method, ...(body !== undefined ? {headers:{'content-type':'application/json'},body:JSON.stringify(body)} : {}) })
const ctx = id => ({params:Promise.resolve({id})})
test('conceptos: creación, edición, listado paginado y desactivación comparten servicio', async()=>{
  let res=await collection.POST(req('POST',{name:'Consultoría',kind:'SERVICIO',fiscalTaxTreatment:'EXENTO'})); assert.equal(res.status,201); let item=await res.json(); const id=item.id
  res=await collection.POST(req('POST',{name:'Transporte',kind:'CARGO'})); assert.equal(res.status,201)
  res=await collection.GET(req('GET',undefined,'?take=1')); let page=await res.json(); assert.equal(page.data.length,1); assert.ok(page.nextCursor)
  res=await collection.GET(req('GET',undefined,`?take=1&cursor=${page.nextCursor}`)); page=await res.json(); assert.equal(page.data.length,1); assert.equal(page.nextCursor,null)
  res=await detail.PUT(req('PUT',{name:'Consultoría editada',kind:'SERVICIO'}),ctx(id)); assert.equal(res.status,200); item=await res.json(); assert.equal(item.fiscalTaxTreatment,'EXENTO')
  res=await detail.DELETE(req('DELETE'),ctx(id)); assert.equal(res.status,204); res=await detail.GET(req('GET'),ctx(id)); assert.equal(res.status,404)
})
test('conceptos: validación, permiso e aislamiento de empresa',async()=>{
  let res=await collection.POST(req('POST',{name:'Mal',kind:'SERVICIO',fiscalTaxTreatment:'OTRO'})); assert.equal(res.status,400); assert.equal((await res.json()).error.code,'INVALID_INPUT')
  actor={id:'b',accountId:'b',isOwner:true}; res=await detail.GET(req('GET'),ctx('c2')); assert.equal(res.status,404)
  res=await detail.PUT(req('PUT',{name:'Robo',kind:'CARGO'}),ctx('c2')); assert.equal(res.status,404)
  res=await detail.DELETE(req('DELETE'),ctx('c2')); assert.equal(res.status,404)
  actor={id:'cashier',accountId:'a',isOwner:false}; res=await collection.GET(req('GET')); assert.equal(res.status,403)
  actor=null; res=await collection.GET(req('GET')); assert.equal(res.status,401)
})
test('catálogos: perfil y permisos filtran opciones',async()=>{
  let policy={jurisdiction:'DO',regime:'DO_ECF',enabled:false}
  const catalog = compile('src/app/api/fiscal/catalogs/route.ts',{ '../../_helpers/auth':{getCurrentUserFromRequest:async()=>actor}, '@/lib/permissions':permissions, '@/lib/fiscal/core/policy':{resolveFiscalPolicy:async()=>policy}, '@/lib/fiscal/core/master-data':master })
  actor={id:'customer',accountId:'a',canManageCustomers:true}; let response=await catalog.GET(req('GET')); let body=await response.json(); assert.equal(response.status,200); assert.ok(body.catalogs.receiptTypes.some(x=>x.code==='E31')); assert.equal(body.catalogs.taxTreatments,undefined)
  policy={jurisdiction:null,regime:null,enabled:false}; response=await catalog.GET(req('GET')); body=await response.json(); assert.equal(body.catalogs.receiptTypes.length,0)
  actor={id:'denied',accountId:'a'}; response=await catalog.GET(req('GET')); assert.equal(response.status,403)
})
test('catálogos validan entradas y conservan valores históricos',()=>{
  assert.throws(()=>master.validateFiscalCatalogFields({fiscalPreferredReceiptType:'E99'}), /no admitido/)
  assert.throws(()=>master.validateFiscalCatalogFields({fiscalIdentificationCountry:'XX'}), /no admitido/)
  assert.doesNotThrow(()=>master.validateFiscalCatalogFields({fiscalResidence:'República Dominicana'},{fiscalResidence:'República Dominicana'}))
  assert.doesNotThrow(()=>master.validateFiscalCatalogFields({fiscalPreferredReceiptType:'["E99","E31"]'},{fiscalPreferredReceiptType:'E99'}))
})
test('handlers comerciales devuelven 400 por entrada fiscal inválida sin escribir',async()=>{
  actor={id:'owner-a',accountId:'a',isOwner:true}; let writes=0
  const deps={
    '@/lib/fiscal/core/master-data':master,
    '../../_helpers/auth':{getCurrentUserFromRequest:async()=>actor},
    '@/lib/permission-guard':{hasPermissionOrLog:async()=>true},
    '@/lib/db':{prisma:{}},
    '@/app/(app)/customers/actions':{upsertCustomer:async()=>{writes++}},
    '@/app/(app)/products/actions':{upsertProduct:async()=>{writes++}},
  }
  const customer=compile('src/app/api/customers/[id]/route.ts',deps)
  let response=await customer.PUT(req('PUT',{name:'Cliente',fiscalIdentification:123}),ctx('x')); assert.equal(response.status,400); assert.equal((await response.json()).field,'fiscalIdentification')
  const product=compile('src/app/api/products/[id]/route.ts',deps)
  response=await product.PUT(req('PUT',{name:'Producto',fiscalTaxTreatment:12}),ctx('x')); assert.equal(response.status,400); assert.equal((await response.json()).field,'fiscalTaxTreatment')
  assert.equal(writes,0)
})
test('detalles de cliente y producto rechazan acceso cruzado y sesión ausente',async()=>{
  let queried=[]
  const fakeDB={customer:{findFirst:async({where})=>{queried.push(where);return null}},product:{findFirst:async({where})=>{queried.push(where);return null}}}
  const deps={'@/lib/fiscal/core/master-data':master,'../../_helpers/auth':{getCurrentUserFromRequest:async()=>actor},'@/lib/permission-guard':{},'@/lib/db':{prisma:fakeDB},'@/app/(app)/customers/actions':{},'@/app/(app)/products/actions':{}}
  const customer=compile('src/app/api/customers/[id]/route.ts',deps), product=compile('src/app/api/products/[id]/route.ts',deps)
  actor={id:'owner-b',accountId:'b',isOwner:true}; assert.equal((await customer.GET(req('GET'),ctx('other'))).status,404); assert.equal((await product.GET(req('GET'),ctx('other'))).status,404); assert.ok(queried.every(q=>q.accountId==='b' && q.isActive))
  actor=null; assert.equal((await customer.GET(req('GET'),ctx('x'))).status,401); assert.equal((await product.GET(req('GET'),ctx('x'))).status,401)
})
test('acción de clientes conserva históricos y exige perfil para nuevas preferencias E',async()=>{
  actor={id:'owner-a',accountId:'a',isOwner:true}
  let fiscalPolicy=null, writes=0
  const existing={id:'cust',visualId:3,accountId:'a',isGeneric:false,creditEnabled:false,creditDays:0,saleDiscountPercentBp:0,fiscalIdentificationType:'RNC antiguo',fiscalPreferredReceiptType:'E99'}
  const mockDB={customer:{findFirst:async({where})=>where.accountId==='a'?existing:null,updateMany:async({data})=>{writes++;for(const [key,value] of Object.entries(data))if(value!==undefined)existing[key]=value;return {count:1}}},fiscalSettings:{findUnique:async()=>fiscalPolicy}}
  const actions=compile('src/app/(app)/customers/actions.ts',{
    'next/cache':{revalidatePath(){}}, '@/lib/fiscal/core/master-data':master, '@/lib/db':{prisma:mockDB}, '@/lib/auth':{getCurrentUser:async()=>actor},
    '@/lib/sanitize':{sanitizeString:x=>x,sanitizePhone:x=>x,sanitizeCedula:x=>x,validateLength:x=>!!x},
    '@/lib/audit-log':{logAuditEvent:async()=>{}}, '@/lib/permission-guard':{ensurePermission:async()=>{}}, '@/lib/customer-helpers':{}
  })
  const input={id:'cust',name:'Cliente',creditEnabled:false,creditDays:0,fiscalIdentificationType:'RNC antiguo',fiscalPreferredReceiptType:'E99'}
  await actions.upsertCustomer(input,actor); assert.equal(writes,1)
  await assert.rejects(actions.upsertCustomer({...input,fiscalPreferredReceiptType:'E31'},actor),/Configura el perfil/); assert.equal(writes,1)
  fiscalPolicy={jurisdiction:'DO',regime:'DO_ECF'}
  await assert.rejects(actions.upsertCustomer({...input,fiscalPreferredReceiptType:'E98'},actor),/no admitido/); assert.equal(writes,1)
  await actions.upsertCustomer({...input,fiscalPreferredReceiptType:'E31'},actor); assert.equal(writes,2)
})
