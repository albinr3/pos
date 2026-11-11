// Navegador efímero + IndexedDB + HTTP Next + PostgreSQL ficticio; sin respuestas simuladas de la API.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import ts from 'typescript'
import { PrismaClient } from '@prisma/client'

export async function runRealOffline({ dbUrl, accountId, userId, freshHeaders, fiscal = false }) {
  const url = new URL(dbUrl)
  if (!['localhost','127.0.0.1'].includes(url.hostname) || url.port !== '55439' || !/^\/cash_test_fiscal_next_\d+$/.test(url.pathname) || accountId !== (fiscal ? 'baseline-account-doprep' : 'baseline-account-rd')) throw new Error('La prueba offline requiere la base ficticia aislada')
  const browser = [process.env.CASH_TEST_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(p => fs.existsSync(p))
  if (!browser) throw new Error('No hay Chrome o Edge para la prueba offline')
  const compile = file => ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const source = compile('src/lib/cash-offline.ts'), stock = compile('src/lib/stock-cache-state.ts')
  const html = `<!doctype html><meta charset="utf-8"><script>
    const stock = {}; new Function('exports', ${JSON.stringify(stock)})(stock);
    window.api = {}; new Function('exports','require', ${JSON.stringify(source)})(window.api, name => { if (name === './stock-cache-state') return stock; throw Error('Importación inesperada'); });
    window.ready = true;
  </script>`
  const profile = path.resolve('tmp',`fiscal-real-offline-browser-${Date.now()}`)
  // Resolver exclusivamente localhost y filtrar cada solicitud por CDP evita tráfico externo del navegador.
  const child = spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--disable-background-networking','--disable-component-update','--disable-sync','--disable-quic','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:'ignore'})
  const stopBrowser = () => { if(child.exitCode === null) child.kill() }
  process.once('exit',stopBrowser)
  let spawnError; child.on('error',e=>{spawnError=e})
  const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms))
  let address
  for (let i=0;i<100&&!spawnError;i++) { try { const lines=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/); if(lines.length===2&&lines[1].startsWith('/devtools/')) {address=lines;break} } catch(e) { if(!['ENOENT','EBUSY','EACCES'].includes(e.code)) throw e } await sleep(100) }
  if (!address) { child.kill(); throw spawnError ?? new Error('El navegador temporal no arrancó') }
  const socket = new WebSocket(`ws://127.0.0.1:${address[0]}${address[1]}`)
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
  let nextId=0, dropNextResponse=false, dropped=false, rejectedExternal=0
  const pending = new Map()
  const call = (method,params={},sessionId) => new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))})
  socket.onmessage = event => {
    const msg=JSON.parse(event.data)
    if(msg.id) {const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p?.reject(new Error(msg.error.message));else p?.resolve(msg.result);return}
    if(msg.method !== 'Fetch.requestPaused') return
    const {requestId,request,responseStatusCode}=msg.params, sid=msg.sessionId
    let target
    try {target=new URL(request.url)} catch {target=null}
    const allowed=target && target.protocol==='http:' && target.hostname==='localhost' && target.port==='3100'
    if(!allowed) { rejectedExternal++; void call('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'},sid).catch(()=>{}); return }
    if(responseStatusCode !== undefined) {
      if(dropNextResponse && target.pathname==='/api/cash-shifts/operations' && responseStatusCode===200) { dropNextResponse=false; dropped=true; void call('Fetch.failRequest',{requestId,errorReason:'Failed'},sid).catch(()=>{}) }
      else void call('Fetch.continueRequest',{requestId},sid).catch(()=>{})
      return
    }
    if(target.pathname==='/__fiscal_offline_fixture') void call('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'},{name:'Cache-Control',value:'no-store'}],body:Buffer.from(html).toString('base64')},sid).catch(()=>{})
    else void call('Fetch.continueRequest',{requestId},sid).catch(()=>{})
  }
  const db = new PrismaClient({datasources:{db:{url:dbUrl}}})
  try {
    const {targetId}=await call('Target.createTarget',{url:'about:blank'})
    const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true})
    await call('Network.enable',{},sessionId)
    await call('Network.setExtraHTTPHeaders',{headers:await freshHeaders()},sessionId)
    await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'},{urlPattern:'*',requestStage:'Response'}]},sessionId)
    const evaluate = async expression => {
      const value=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId)
      if(value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text)
      return value.result.value
    }
    const ready = async () => { for(let i=0;i<150;i++){if(await evaluate('window.ready === true')) return;await sleep(100)}throw Error('No cargó el fixture del navegador') }
    await call('Page.enable',{},sessionId)
    await call('Page.navigate',{url:'http://localhost:3100/__fiscal_offline_fixture'},sessionId); await ready()
    const context = await evaluate('window.api.refreshCashContext()')
    assert.equal(context.accountId,accountId); assert.equal(context.userId,userId); assert.equal(context.fiscalQueuePolicy.enabled,fiscal)
    const productId=fiscal?'prod-doprep-item':'prod-rd-gravado'
    const before = await db.sale.count({where:{accountId}}), stockBefore = Number((await db.product.findUniqueOrThrow({where:{id:productId},select:{stock:true}})).stock)
    const previousSaleIds=fiscal?new Set((await db.sale.findMany({where:{accountId},select:{id:true}})).map(sale=>sale.id)):null
    await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},sessionId)
    const payload = {customerId:null,type:'CONTADO',paymentMethod:'EFECTIVO',treasuryAccountId:fiscal?'treasury-doprep-caja':'treasury-rd-caja',items:[{productId,qty:1,unitPriceCents:fiscal?15000:10000,wasPriceOverridden:false}],...(fiscal?{fiscal:{type:'E32',expectedPolicyVersion:context.fiscalQueuePolicy.version},applyLegalTip:false,salePricesIncludeItbis:true,soldAt:'2026-11-10T12:00:00.000Z'}:{})}
    const queued = await evaluate(`window.api.submitControlledDocument('sale',${JSON.stringify(payload)},${JSON.stringify({id:userId,accountId})})`)
    assert.equal(queued.pending,true); const rows=await evaluate('window.api.cashPending()'); assert.equal(rows.length,1)
    if(fiscal) { assert.equal(rows[0].payload.fiscal.type,'E32'); assert.equal('eNcf' in rows[0].payload.fiscal,false) }
    const operationId=rows[0].id; assert.equal(await db.sale.count({where:{accountId}}),before)
    await call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1},sessionId)
    await evaluate('window.ready = false')
    await call('Page.reload',{ignoreCache:true},sessionId); await ready()
    assert.equal((await evaluate('window.api.cashPending()'))[0].id,operationId,'IndexedDB debe conservar la misma operación tras recargar')
    await call('Network.setExtraHTTPHeaders',{headers:await freshHeaders()},sessionId)
    dropNextResponse=true
    const failed=await evaluate("window.api.syncCashOutbox().then(()=>false,()=>true)")
    assert.equal(failed,true); assert.equal(dropped,true,'La respuesta debe perderse después del commit')
    assert.equal((await evaluate('window.api.cashPending()'))[0].id,operationId)
    assert.equal(await db.sale.count({where:{accountId}}),before+1)
    await evaluate('window.api.syncCashOutbox()')
    assert.equal((await evaluate('window.api.cashPending()')).length,0)
    assert.equal(await db.sale.count({where:{accountId}}),before+1,'El reintento no debe crear otra venta')
    assert.equal(Number((await db.product.findUniqueOrThrow({where:{id:productId},select:{stock:true}})).stock),stockBefore-1)
    if(fiscal) {
      const sales=await db.sale.findMany({where:{accountId},select:{id:true}})
      const newSales=sales.filter(sale=>!previousSaleIds.has(sale.id));assert.equal(newSales.length,1)
      // La base de la etapa 7 usa la migración documental anterior, sin columnas de compras posteriores.
      const [document]=await db.$queryRaw`SELECT id,state FROM "FiscalDocument" WHERE "accountId"=${accountId} AND "saleId"=${newSales[0].id} LIMIT 1`
      assert.equal(document?.state,'PREPARADO_PENDIENTE_CONEXION')
      assert.equal(await db.fiscalNumberAllocation.count({where:{accountId,documentId:document.id}}),1)
      // Un rechazo anterior debe revisarse de nuevo si cambia el detalle antes de confirmar.
      // La versión desactualizada debe ser válida: cero se rechaza antes de comparar la política.
      const staleVersion=context.fiscalQueuePolicy.version+1
      const reviewId=`review-${Date.now()}`
      const reviewed={id:reviewId,kind:'sale',payload:{...payload,fiscal:{...payload.fiscal,expectedPolicyVersion:staleVersion}},reportAmountCents:15000,cashOperation:{accountId,userId,clientOperationId:reviewId,cashShiftId:null,clientSequence:null,fiscalPolicyVersion:staleVersion}}
      await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('movopos-cash-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const tx=r.result.transaction('outbox','readwrite');tx.objectStore('outbox').put(${JSON.stringify(reviewed)});tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)}})`)
      await evaluate('window.api.syncCashOutbox().catch(()=>{})')
      assert.equal((await evaluate('window.api.cashPending()'))[0].errorCode,'FISCAL_POLICY_CHANGED')
      // Runtime.evaluate ejecuta una expresión: encadenar promesas evita usar await fuera de una función async.
      await evaluate(`window.api.previewPendingFiscalPolicy(${JSON.stringify(reviewId)}).then(review => window.api.acceptPendingFiscalPolicy(review))`)
      const product=await db.product.findUniqueOrThrow({where:{id:productId},select:{name:true}})
      await db.product.update({where:{id:productId},data:{name:`${product.name} revisado`}})
      await evaluate('window.api.syncCashOutbox().catch(()=>{})')
      assert.equal((await evaluate('window.api.cashPending()'))[0].errorCode,'FISCAL_REVIEW_CHANGED')
      assert.equal(await db.sale.count({where:{accountId}}),before+1,'El cambio de detalle debe revertir la venta')
      await evaluate(`window.api.previewPendingFiscalPolicy(${JSON.stringify(reviewId)}).then(review => window.api.acceptPendingFiscalPolicy(review))`)
      await evaluate('window.api.syncCashOutbox()')
      assert.equal((await evaluate('window.api.cashPending()')).length,0)
      assert.equal(await db.sale.count({where:{accountId}}),before+2,'La venta se confirma una sola vez tras la nueva revisión')
    }
    // Fixture antiguo con tres decimales: debe permanecer en IndexedDB para revisión, sin redondearse.
    const invalidPayload={...payload,items:[{...payload.items[0],qty:1.001}]}
    const invalidRecord={id:'legacy-three-decimals',kind:'sale',payload:invalidPayload,cashOperation:{accountId,userId,clientOperationId:'legacy-three-decimals',cashShiftId:null,clientSequence:null,fiscalPolicyVersion:context.fiscalQueuePolicy.version}}
    await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('movopos-cash-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const tx=r.result.transaction('outbox','readwrite');tx.objectStore('outbox').put(${JSON.stringify(invalidRecord)});tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)}})`)
    await call('Network.setExtraHTTPHeaders',{headers:await freshHeaders()},sessionId)
    const invalidMessage=await evaluate("window.api.syncCashOutbox().then(()=>null,e=>e.message)")
    assert.match(invalidMessage,/máximo dos decimales/)
    const remains=await evaluate('window.api.cashPending()'); assert.equal(remains.length,1); assert.equal(remains[0].payload.items[0].qty,1.001)
    assert.equal(await db.sale.count({where:{accountId}}),before+(fiscal?2:1))
    assert.equal(rejectedExternal,0,'El navegador intentó acceder a un destino distinto del servidor aislado')
    console.log('Offline real: IndexedDB, recarga, respuesta perdida, reintento, inventario y pendiente incompatible verificados')
  } finally { await db.$disconnect(); await call('Browser.close').catch(()=>{}); socket.close(); stopBrowser(); process.removeListener('exit',stopBrowser) }
}
