import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/fiscal/core/settings.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const rows = new Map(), audit = []
const table = { findUnique: async ({where}) => rows.get(where.accountId) ?? null, create: async ({data}) => { rows.set(data.accountId, data); return data }, update: async ({where,data}) => { const result = {...rows.get(where.accountId), ...data}; rows.set(where.accountId, result); return result } }
const tx = { fiscalSettings: table, fiscalPolicyChange: { create: async ({data}) => audit.push(data) }, $queryRaw: async () => [{id:'fixture'}] }
const prisma = { fiscalSettings: table, $transaction: async fn => fn(tx) }
const exports = {}
vm.runInNewContext(compiled, { exports, require(name) { if(name === '@/lib/db') return { prisma }; if(name === '@/lib/permissions') return { hasPermission: u => Boolean(u.isOwner || u.canManageFiscalSettings) }; return require(name) } })
const actor = {id:'owner',accountId:'a',isOwner:true}
const body = {expectedVersion:0,jurisdiction:'DO',regime:'DO_ECF',environment:'TEST',legalName:'Empresa',taxId:'123',fiscalAddress:'Dirección',fiscalEmail:'a@example.test',fiscalPhone:null}
test('guarda y consulta configuración aislada y audita la versión', async () => {
  const initial=await exports.getFiscalSettings(actor); assert.equal(initial.enabled,false); assert.equal(initial.version,0)
  const saved=await exports.updateFiscalSettings(actor,body); assert.equal(saved.configurationStatus,'VALIDATED'); assert.equal(saved.activationAvailable,true); assert.equal(saved.version,1)
  assert.equal((await exports.getFiscalSettings(actor)).legalName,'Empresa'); assert.equal((await exports.getFiscalSettings({...actor,accountId:'b'})).legalName,null); assert.equal(audit.length,1)
})
test('rechaza permisos, versión anterior y correo inválido', async () => {
  await assert.rejects(exports.getFiscalSettings({id:'x',accountId:'a'}), e => e.code==='FORBIDDEN')
  await assert.rejects(exports.updateFiscalSettings(actor,body), e => e.code==='VERSION_CONFLICT')
  await assert.rejects(exports.updateFiscalSettings(actor,{...body,expectedVersion:1,fiscalEmail:'incorrecto'}), e => e.code==='INVALID_INPUT')
})
test('permite datos incompletos sin activar el módulo', async () => {
  const saved=await exports.updateFiscalSettings({...actor,accountId:'b'},{...body,legalName:null}); assert.equal(saved.configurationStatus,'INCOMPLETE'); assert.equal(saved.enabled,false); assert.ok(saved.missingFields.includes('legalName'))
})
test('activa explícitamente, conserva el estado al editar y permite desactivar', async () => {
  await assert.rejects(exports.updateFiscalSettings({...actor,accountId:'b'},{...body,expectedVersion:1,legalName:null,enabled:true}), e => e.code==='CONFIGURATION_INCOMPLETE' && e.status===422)
  let saved=await exports.updateFiscalSettings(actor,{...body,expectedVersion:1,enabled:true})
  assert.equal(saved.enabled,true); assert.equal(saved.externalReadiness,'NOT_CONNECTED'); assert.equal(saved.version,2)
  saved=await exports.updateFiscalSettings(actor,{...body,expectedVersion:2,legalName:'Nombre editado'})
  assert.equal(saved.enabled,true); assert.equal(saved.version,3)
  await assert.rejects(exports.updateFiscalSettings(actor,{...body,expectedVersion:3,legalName:null}), e => e.code==='CONFIGURATION_INCOMPLETE')
  saved=await exports.updateFiscalSettings(actor,{...body,expectedVersion:3,enabled:false})
  assert.equal(saved.enabled,false); assert.equal(saved.version,4)
  assert.equal(rows.get('b').enabled,false)
  assert.deepEqual(audit.filter(e => e.accountId==='a').map(e => e.policy.enabled),[false,true,true,false])
})

const routeSource = fs.readFileSync(new URL('../src/app/api/fiscal/settings/route.ts', import.meta.url),'utf8')
const routeCompiled = ts.transpileModule(routeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const route = {}; let requestUser = actor
vm.runInNewContext(routeCompiled,{exports:route,crypto:require('node:crypto'),console,require(name){
  if(name==='next/server') return require('next/server')
  if(name==='../../_helpers/auth') return {getCurrentUserFromRequest:async()=>requestUser}
  if(name==='@/lib/fiscal/core/settings') return exports
  return require(name)
}})
test('handlers HTTP comparten validaciones, permisos y control de versión',async()=>{
  const request = value => ({json:async()=>value})
  requestUser = {...actor,accountId:'c'}
  let response=await route.GET(request()); assert.equal(response.status,200); assert.equal((await response.json()).version,0)
  response=await route.PUT(request(body)); assert.equal(response.status,200); assert.equal((await response.json()).version,1)
  response=await route.PUT(request(body)); assert.equal(response.status,409); assert.equal((await response.json()).error.code,'VERSION_CONFLICT')
  response=await route.PUT(request({...body,expectedVersion:1,enabled:true})); assert.equal(response.status,200); assert.equal((await response.json()).enabled,true)
  response=await route.PUT(request({...body,expectedVersion:2,enabled:false})); assert.equal(response.status,200); assert.equal((await response.json()).enabled,false)
  requestUser={id:'cashier',accountId:'c'}; response=await route.GET(request()); assert.equal(response.status,403)
  requestUser=null; response=await route.GET(request()); assert.equal(response.status,401)
})
