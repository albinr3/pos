// IndexedDB y navegador reales; las respuestas de autenticación y auditoría son ficticias.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { runBrowserSuite } from './run-browser-suite.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function browserSuite() {
  const results = [], actor = { id: 'empleado-A', accountId: 'empresa-A' }, seen = new Map()
  const assert = (value, message) => { if (!value) throw new Error(message) }
  async function test(name, fn) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: error.stack }) } }
  let current = actor, drop = false, delay = null, policyCase = false, rejectReviewed = false, previewGross = '118.00', confirmed = 0
  window.fetch = async (url, options = {}) => {
    if (url === '/api/cash-shifts') return Response.json({ accountId: current.accountId, userId: current.id, isOwner: !!current.isOwner, enabled: false, activeShift: null, fiscalQueuePolicy: { enabled: policyCase, version: policyCase ? 2 : 0 } })
    if (url === '/api/fiscal/sales/preview' && policyCase) return Response.json({ type: 'E32', issueDate: '2026-11-11', reviewSignature: 'fixture-review', totals: { gross: previewGross, tax: '18.00' } })
    if (url === '/api/cash-shifts/operations') {
      const body = JSON.parse(options.body)
      assert(body.cashOperation.accountId === current.accountId && body.cashOperation.userId === current.id, 'La auditoría debe usar la sesión actual')
      if (policyCase) {
        if (body.cashOperation.fiscalPolicyVersion !== 2) return Response.json({ error: 'La política fiscal cambió', code: 'FISCAL_POLICY_CHANGED' }, { status: 409 })
        if (rejectReviewed) { rejectReviewed = false; return Response.json({ error: 'El detalle fiscal cambió', code: 'FISCAL_REVIEW_CHANGED' }, { status: 409 }) }
        if (body.cashOperation.clientOperationId === 'ordinary-pending') assert(body.payload.fiscal === null && body.payload.expectedTotalCents === 11800, 'La venta ordinaria debe conservar el total y confirmar su elección')
        else assert(body.cashOperation.clientOperationId === 'policy-pending' && body.payload.fiscal.expectedPolicyVersion === 2 && body.payload.fiscal.expectedTotalCents === 11800 && typeof body.payload.fiscal.expectedReview === 'string', 'La revisión debe conservar ID y proteger el detalle')
        confirmed++; return Response.json({ result: { invoiceCode: 'TEST-1' } })
      }
      if (!seen.has(body.cashOperation.clientOperationId)) seen.set(body.cashOperation.clientOperationId, body)
      if (drop) { drop = false; throw new TypeError('Respuesta perdida') }
      if (delay) await delay
      return Response.json({ result: { discarded: true } })
    }
    throw new Error('Ruta inesperada')
  }
  const sale = (id, accountId, userId, qty = 1) => ({ tempId: id, accountId, userId, customerId: null, type: 'CONTADO', items: [{ productId: 'p', qty, unitPriceCents: 100, wasPriceOverridden: false }], username: 'ana', createdAt: 1700000000000 })
  await test('Actualizar IndexedDB v1 conserva la venta y no sustituye su identidad', async () => {
    const open = indexedDB.open('movopos-offline', 1)
    open.onupgradeneeded = () => { open.result.createObjectStore('pendingSales', { keyPath: 'tempId' }); open.result.createObjectStore('productsCache', { keyPath: 'id' }) }
    const old = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
    const tx = old.transaction('pendingSales', 'readwrite')
    tx.objectStore('pendingSales').put({ ...sale('v1', actor.accountId, actor.id), fiscal: { type: 'E32', expectedPolicyVersion: 3 } })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    old.close()
    const migrated = (await offline.getPendingSales()).find(row => row.tempId === 'v1')
    assert(migrated?.userId === actor.id && migrated?.fiscal?.expectedPolicyVersion === 3, 'El pendiente y sus metadatos deben sobrevivir')
    await offline.deletePendingSale('v1')
  })
  await test('Las cachés offline aíslan empresa y empleado', async () => {
    const otherUser = { id: 'empleado-B', accountId: actor.accountId }, otherAccount = { id: actor.id, accountId: 'empresa-B' }
    await offline.saveProductsCache([{ id: 'p', accountId: actor.accountId, name: 'A' }], actor)
    await offline.saveCustomersCache([{ id: 'c', name: 'Cliente A' }], actor)
    await offline.saveARCache([{ id: 'ar', balanceCents: 100 }], actor)
    await offline.saveCustomersCache([{ id: 'c', name: 'Cliente B' }], otherUser)
    assert((await offline.getCustomersCache(actor))[0]?.name === 'Cliente A', 'Otro empleado no debe sobrescribir la caché')
    assert((await offline.getProductsCache(otherAccount)).length === 0 && (await offline.getARCache(otherUser)).length === 0, 'La caché no debe cruzar empresas o empleados')
    assert((await offline.getCustomersCache()).length === 0, 'Sin identidad no se muestra caché privada')
  })
  await test('Solo se muestran pendientes con empresa y empleado comprobables', async () => {
    await offline.savePendingSale(sale('propio', actor.accountId, actor.id))
    await offline.savePendingSale(sale('otro', 'empresa-B', 'empleado-B'))
    await offline.savePendingSale(sale('sin-autor', undefined, undefined))
    const visible = await offline.getReviewableLegacyPending(actor)
    assert(visible.length === 1 && visible[0].id === 'propio', 'No debe mostrar otros usuarios o registros sin autoría')
  })
  await test('Una sesión diferente no retira pendientes', async () => {
    current = { id: 'empleado-B', accountId: 'empresa-B' }
    let failed = false; try { await offline.retireReviewedLegacyPending(actor, 'sale', 'propio', 'Revisado') } catch { failed = true }
    assert(failed && (await offline.getPendingSales()).some(row => row.tempId === 'propio'), 'Debe conservar el pendiente')
    current = actor
  })
  await test('Respuesta perdida se reintenta con la misma auditoría antes de retirar', async () => {
    drop = true; let failed = false
    try { await offline.retireReviewedLegacyPending(actor, 'sale', 'propio', 'Ya comprobado') } catch { failed = true }
    assert(failed && seen.size === 1 && (await offline.getPendingSales()).some(row => row.tempId === 'propio'), 'La pérdida no debe borrar el pendiente')
    await offline.retireReviewedLegacyPending(actor, 'sale', 'propio', 'Ya comprobado')
    assert(seen.size === 1 && !(await offline.getPendingSales()).some(row => row.tempId === 'propio'), 'El reintento debe reutilizar la auditoría')
    assert((await offline.getPendingSales()).length === 2, 'No debe tocar otros pendientes')
  })
  await test('Una revisión tardía no borra un pendiente modificado en otra pestaña', async () => {
    await offline.savePendingSale(sale('cambio', actor.accountId, actor.id))
    let release; delay = new Promise(resolve => { release = resolve })
    const review = offline.retireReviewedLegacyPending(actor, 'sale', 'cambio', 'Verificado').then(() => false, () => true)
    for (let i = 0; i < 100 && seen.size < 2; i++) await new Promise(resolve => setTimeout(resolve, 10))
    await offline.savePendingSale(sale('cambio', actor.accountId, actor.id, 2)); release(); delay = null
    assert(await review, 'Debe avisar que el pendiente cambió')
    assert((await offline.getPendingSales()).find(row => row.tempId === 'cambio')?.items[0].qty === 2, 'Debe conservar la versión modificada')
  })
  await test('El dueño revisa pendientes de su empresa sin inventar autor ni acceder a otras', async () => {
    await offline.savePendingSale(sale('sin-empleado', actor.accountId, undefined))
    let forged = false
    try { await offline.retireReviewedLegacyPending({ ...actor, isOwner: true }, 'sale', 'sin-empleado', 'Intento') } catch { forged = true }
    assert(forged && (await offline.getPendingSales()).some(row => row.tempId === 'sin-empleado'), 'El navegador no puede otorgarse el permiso de dueño')
    const owner = { id: 'propietario', accountId: actor.accountId, isOwner: true }; current = owner
    const visible = await offline.getReviewableLegacyPending(owner)
    assert(visible.some(row => row.id === 'sin-empleado') && !visible.some(row => row.id === 'otro'), 'Debe limitarse a la empresa autenticada')
    await offline.retireReviewedLegacyPending(owner, 'sale', 'sin-empleado', 'Revisado por propietario')
    const review = [...seen.values()].find(body => body.payload.originalPayload.tempId === 'sin-empleado')
    assert(review && review.cashOperation.userId === owner.id && review.payload.originalPayload.userId === undefined, 'La auditoría debe distinguir revisor de autor desconocido')
  })
  await test('Cambio de política conserva la venta y exige confirmar el mismo importe', async () => {
    current = actor; policyCase = true
    await cash.cashPending()
    const open = indexedDB.open('movopos-cash-v1')
    const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
    const tx = db.transaction('outbox', 'readwrite')
    tx.objectStore('outbox').put({ id: 'policy-pending', kind: 'sale', payload: { fiscal: { type: 'E32', expectedPolicyVersion: 1 }, items: [] }, reportAmountCents: 11800, cashOperation: { accountId: actor.accountId, userId: actor.id, clientOperationId: 'policy-pending', cashShiftId: null, clientSequence: null, fiscalPolicyVersion: 1 } })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) }); db.close()
    await cash.syncCashOutbox().catch(() => {})
    let record = (await cash.cashPending())[0]
    assert(record?.errorCode === 'FISCAL_POLICY_CHANGED' && record.cashOperation.fiscalPolicyVersion === 1, 'El rechazo debe conservar el pendiente')
    previewGross = '117.00'
    let rejected = false; try { await cash.previewPendingFiscalPolicy(record.id) } catch { rejected = true }
    assert(rejected && (await cash.cashPending())[0].cashOperation.fiscalPolicyVersion === 1, 'No se debe aceptar un importe distinto')
    previewGross = '118.00'
    const review = await cash.previewPendingFiscalPolicy(record.id)
    rejected = false; try { await cash.acceptPendingFiscalPolicy({ ...review, totalCents: 11700 }) } catch { rejected = true }
    assert(rejected && (await cash.cashPending())[0].cashOperation.fiscalPolicyVersion === 1, 'No se puede aprobar otro total')
    await cash.acceptPendingFiscalPolicy(review)
    record = (await cash.cashPending())[0]
    assert(record.id === 'policy-pending' && record.cashOperation.fiscalPolicyVersion === 2, 'La confirmación debe preservar la identidad')
    // Un segundo rechazo no debe bloquear la revisión ni sobrescribir la auditoría anterior.
    rejectReviewed = true
    await cash.syncCashOutbox().catch(() => {})
    record = (await cash.cashPending())[0]
    assert(record.errorCode === 'FISCAL_REVIEW_CHANGED', 'El detalle cambiado debe conservar el pendiente')
    await cash.acceptPendingFiscalPolicy(await cash.previewPendingFiscalPolicy(record.id))
    const auditOpen = indexedDB.open('movopos-cash-v1')
    const auditDb = await new Promise((resolve, reject) => { auditOpen.onsuccess = () => resolve(auditOpen.result); auditOpen.onerror = () => reject(auditOpen.error) })
    const keysRequest = auditDb.transaction('state').objectStore('state').getAllKeys()
    const auditKeys = await new Promise((resolve, reject) => { keysRequest.onsuccess = () => resolve(keysRequest.result); keysRequest.onerror = () => reject(keysRequest.error) })
    auditDb.close()
    assert(auditKeys.filter(key => typeof key === 'string' && key.startsWith('policy-review:policy-pending:')).length === 2, 'Cada revisión debe conservar su auditoría')
    await cash.syncCashOutbox()
    assert(confirmed === 1 && !(await cash.cashPending()).length, 'La venta debe confirmarse una sola vez')
    policyCase = false
  })
  await test('La venta ordinaria pendiente exige confirmar el total después de activar fiscal', async () => {
    current = actor; policyCase = true; confirmed = 0
    const open = indexedDB.open('movopos-cash-v1')
    const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
    const tx = db.transaction('outbox', 'readwrite')
    tx.objectStore('outbox').put({ id: 'ordinary-pending', kind: 'sale', payload: { items: [] }, reportAmountCents: 11800, cashOperation: { accountId: actor.accountId, userId: actor.id, clientOperationId: 'ordinary-pending', cashShiftId: null, clientSequence: null, fiscalPolicyVersion: 0 } })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) }); db.close()
    await cash.syncCashOutbox().catch(() => {})
    const review = await cash.previewPendingFiscalPolicy('ordinary-pending')
    assert(review.type === 'ORDINARIO' && review.totalCents === 11800, 'Debe mostrar que se revisará como venta ordinaria')
    await cash.acceptPendingFiscalPolicy(review)
    await cash.syncCashOutbox()
    assert(confirmed === 1 && !(await cash.cashPending()).length, 'Debe confirmar una sola vez')
    policyCase = false
  })
  document.getElementById('result').textContent = JSON.stringify(results)
}

const compiled = await build({ stdin: { contents: `import * as offline from './src/lib/indexed-db'; import * as cash from './src/lib/cash-offline'; (${browserSuite.toString()})().catch(e=>document.getElementById('result').textContent=JSON.stringify([{ok:false,error:e.stack}]));`, resolveDir: root }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } })
await runBrowserSuite(root, 'fiscal-legacy-review', `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>${compiled.outputFiles[0].text}</script>`)
