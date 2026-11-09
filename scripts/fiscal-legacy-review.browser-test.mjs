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
  let current = actor, drop = false, delay = null
  window.fetch = async (url, options = {}) => {
    if (url === '/api/cash-shifts') return Response.json({ accountId: current.accountId, userId: current.id, isOwner: !!current.isOwner, enabled: false, activeShift: null })
    if (url === '/api/cash-shifts/operations') {
      const body = JSON.parse(options.body)
      assert(body.cashOperation.accountId === current.accountId && body.cashOperation.userId === current.id, 'La auditoría debe usar la sesión actual')
      if (!seen.has(body.cashOperation.clientOperationId)) seen.set(body.cashOperation.clientOperationId, body)
      if (drop) { drop = false; throw new TypeError('Respuesta perdida') }
      if (delay) await delay
      return Response.json({ result: { discarded: true } })
    }
    throw new Error('Ruta inesperada')
  }
  const sale = (id, accountId, userId, qty = 1) => ({ tempId: id, accountId, userId, customerId: null, type: 'CONTADO', items: [{ productId: 'p', qty, unitPriceCents: 100, wasPriceOverridden: false }], username: 'ana', createdAt: 1700000000000 })
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
  document.getElementById('result').textContent = JSON.stringify(results)
}

const compiled = await build({ stdin: { contents: `import * as offline from './src/lib/indexed-db'; (${browserSuite.toString()})().catch(e=>document.getElementById('result').textContent=JSON.stringify([{ok:false,error:e.stack}]));`, resolveDir: root }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } })
await runBrowserSuite(root, 'fiscal-legacy-review', `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>${compiled.outputFiles[0].text}</script>`)
