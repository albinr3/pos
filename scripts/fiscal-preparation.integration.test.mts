import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { NextRequest } from 'next/server.js'
import crypto from 'node:crypto'
const preparation = await import('../src/lib/fiscal/core/preparation')
const { createFiscalDraft,updateFiscalDraft,prepareFiscalDraft,getFiscalOperation,getFiscalDocument,listFiscalDocuments,fiscalHistory } = preparation
const { createSequence } = await import('../src/lib/fiscal/core/sequences')
const db=new PrismaClient()
const a={id:'user-rd-owner',accountId:'baseline-account-rd',isOwner:true},b={id:'user-doprep-owner',accountId:'baseline-account-doprep',isOwner:true}
const input={type:'E31',issueDate:'2026-11-10',expectedPolicyVersion:1,issuer:{id:'baseline-account-rd',name:'Empresa prueba',identification:'123456789',country:'DO'},buyer:{name:'Cliente prueba',identification:'101000001',country:'DO'},source:{kind:'SALE',id:'stage6-sale'},incomeType:'01',payment:{type:'CONTADO'},currency:{operation:'DOP',reporting:'DOP'},lines:[{productId:'prod-rd-gravado',description:'Producto',kind:'BIEN',unit:'UNIDAD',quantity:'1',unitPrice:'118',discount:'0.00',taxTreatment:'GRAVADO_18',priceIncludesTax:true}]}
test('preparación local transaccional, recuperación, permisos y aislamiento',async()=>{try{
 await db.fiscalSettings.create({data:{accountId:a.accountId,enabled:true,jurisdiction:'DO',regime:'DO_ECF',environment:'TEST',configurationStatus:'VALIDATED',version:1,legalName:'Empresa prueba',taxId:'123456789'}})
 await db.product.update({where:{id:'prod-rd-gravado'},data:{name:'Producto',fiscalItemType:'BIEN',fiscalUnit:'UNIDAD',fiscalTaxTreatment:'GRAVADO'}})
 await db.sale.create({data:{id:'stage6-sale',accountId:a.accountId,userId:a.id,customerId:'cust-rd-generic',invoiceNumber:99991,invoiceCode:'STAGE6-TEST',soldAt:new Date('2026-11-10T12:00:00Z'),type:'CONTADO',paymentMethod:'EFECTIVO',subtotalCents:10000,itbisCents:1800,totalCents:11800,items:{create:{productId:'prod-rd-gravado',qty:1,unitPriceCents:11800,costCents:6000,itbisRateBp:1800,lineTotalCents:11800}}}})
 const doc:any=await createFiscalDraft(a,{operationId:'create-stage6-0001',document:input});assert.equal(doc.revision,1)
 assert.deepEqual(await createFiscalDraft(a,{operationId:'create-stage6-0001',document:input}),doc)
 await assert.rejects(createFiscalDraft(a,{operationId:'create-stage6-0001',document:{...input,issueDate:'2026-11-11'}}),/identificador/)
 await assert.rejects(prepareFiscalDraft(a,doc.id,{operationId:'prepare-stage6-01',expectedRevision:1}),/rango/)
 assert.equal((await getFiscalOperation(a,'prepare-stage6-01')).status,'FAILED')
 assert.equal(Number((await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM "FiscalNumberAllocation"`)[0].n),0)
 const edited:any=await updateFiscalDraft(a,doc.id,{operationId:'update-stage6-001',expectedRevision:1,document:{...input,lines:[{...input.lines[0],description:'Producto editado'}]}});assert.equal(edited.revision,2)
 await assert.rejects(updateFiscalDraft(a,doc.id,{operationId:'update-stage6-002',expectedRevision:1,document:input}),/cambió/)
 await createSequence(a,{type:'E31',environment:'TEST',rangeStart:'1',rangeEnd:'100',expiresOn:'2099-12-31',active:true,authorizationRef:null,notes:null,reason:'Prueba'})
 // Un concepto distinto con el mismo total no puede sustituir los datos de la venta original.
 await assert.rejects(prepareFiscalDraft(a,doc.id,{operationId:'prepare-stage7-forged',expectedRevision:2}),/no coincide/)
 assert.equal(Number((await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM "FiscalNumberAllocation"`)[0].n),0)
 // Un cambio comercial no puede pasar inadvertido aunque el total siga siendo idéntico.
 await db.sale.update({where:{id:'stage6-sale'},data:{paymentMethod:'TARJETA'}})
 await assert.rejects(prepareFiscalDraft(a,doc.id,{operationId:'prepare-stage7-changed',expectedRevision:2}),/necesita revisión/)
 assert.equal(Number((await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM "FiscalNumberAllocation"`)[0].n),0)
 const refreshed:any=await updateFiscalDraft(a,doc.id,{operationId:'update-stage7-001',expectedRevision:2,document:input});assert.equal(refreshed.revision,3)
 const req={operationId:'prepare-stage6-02',expectedRevision:3};const results=await Promise.all([prepareFiscalDraft(a,doc.id,req),prepareFiscalDraft(a,doc.id,req)]);assert.deepEqual(results[0],results[1]);assert.equal((results[0] as any).eNcf,'E310000000001')
 assert.deepEqual(await prepareFiscalDraft(a,doc.id,req),results[0]);await assert.rejects(prepareFiscalDraft(a,doc.id,{...req,expectedRevision:1}),/identificador/)
 assert.equal(Number((await db.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM "FiscalNumberAllocation"`)[0].n),1)
 await assert.rejects(updateFiscalDraft(a,doc.id,{operationId:'update-stage6-003',expectedRevision:2,document:input}),/congelado/)
 await assert.rejects(db.sale.update({where:{id:'stage6-sale'},data:{totalCents:100}}),/protegida/)
 await assert.rejects(getFiscalDocument(b,doc.id),/encontrado/)
 await assert.rejects(listFiscalDocuments({id:'no-permission',accountId:a.accountId},new URLSearchParams()),/permiso/)
 const list=await listFiscalDocuments(a,new URLSearchParams({source:'SALE',type:'E31',party:'Cliente',state:'PREPARADO_PENDIENTE_CONEXION'}));assert.equal(list.data.length,1)
 assert.ok((await fiscalHistory(a,doc.id,new URLSearchParams())).data.length>=4)
 // Los handlers reciben peticiones sin cookies y un actor simulado; no prueban Clerk real.
 const require=createRequire(import.meta.url); let mobileActor: any=null; const cache=new Map<string,any>()
 function compile(file:string):any {if(cache.has(file))return cache.get(file);const exports:any={};cache.set(file,exports);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{exports,console,crypto,require(name:string){if(name==='@/lib/fiscal/core/preparation')return preparation;if(name==='../../_helpers/auth')return {getCurrentUserFromRequest:async()=>mobileActor};if(name==='./_shared'||name==='../_shared'||name==='../../_shared'||name==='../../documents/_shared')return compile('src/app/api/fiscal/documents/_shared.ts');if(name==='@/lib/fiscal/core/document')return require('../src/lib/fiscal/core/document');if(name==='@/lib/fiscal/core/sequences')return require('../src/lib/fiscal/core/sequences');return require(name==='next/server'?'next/server.js':name)}},{filename:file});return exports}
 const routes=compile('src/app/api/fiscal/documents/route.ts'),detail=compile('src/app/api/fiscal/documents/[id]/route.ts');const request=new NextRequest('http://localhost/api/fiscal/documents');assert.equal((await routes.GET(request)).status,401)
 mobileActor={id:'noperm',accountId:a.accountId};assert.equal((await routes.GET(request)).status,403)
 mobileActor=b;assert.equal((await detail.GET(request,{params:Promise.resolve({id:doc.id})})).status,404)
 mobileActor=a;const mobileResponse=await routes.GET(request);assert.equal(mobileResponse.status,200);assert.equal(mobileResponse.headers.get('cache-control'),'private, no-store')
 const prepareRoute=compile('src/app/api/fiscal/documents/[id]/prepare/route.ts');const opRoute=compile('src/app/api/fiscal/operations/[operationId]/route.ts')
 const mobileRequest=new NextRequest(`http://localhost/api/fiscal/documents/${doc.id}/prepare`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req)})
 const mobilePrepared=await prepareRoute.POST(mobileRequest,{params:Promise.resolve({id:doc.id})});assert.equal(mobilePrepared.status,200);assert.equal((await mobilePrepared.json()).eNcf,'E310000000001')
 const mobileOperation=await opRoute.GET(request,{params:Promise.resolve({operationId:req.operationId})});assert.equal(mobileOperation.status,200);assert.equal((await mobileOperation.json()).status,'COMPLETED')
 await db.fiscalSettings.update({where:{accountId:a.accountId},data:{enabled:false}})
 assert.equal((await getFiscalOperation(a,req.operationId)).status,'COMPLETED');assert.equal((await getFiscalDocument(a,doc.id)).state,'PREPARADO_PENDIENTE_CONEXION')
 }finally{await db.$disconnect()}})
