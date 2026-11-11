import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync('public/sw.js', 'utf8')
const origin = 'http://localhost:3100'
function fixture() {
  const stores = new Map()
  let online = true, failWrites = false, session = { accountId: 'account-A', id: 'user-A' }
  const key = request => typeof request === 'string' ? new URL(request, origin).href : request.url
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)
      return {
        async put(request, response) { if (failWrites) throw Error('storage unavailable'); store.set(key(request), response.clone()) },
        async match(request) { return store.get(key(request))?.clone() },
        async delete(request) { return store.delete(key(request)) },
        async addAll(requests) { for (const request of requests) store.set(key(request), new Response('OFFLINE')) },
      }
    },
    async keys() { return [...stores.keys()] },
    async delete(name) { return stores.delete(name) },
  }
  async function fetch(request) {
    if (!online) throw Error('offline')
    if (key(request) === `${origin}/api/auth/me`) return Response.json({ user: session })
    return new Response('PÁGINA PRIVADA', { status: 200 })
  }
  function worker() {
    const events = new Map()
    const self = { location: { origin }, addEventListener(type, fn) { events.set(type, fn) }, skipWaiting() {}, clients: { claim() {} } }
    vm.runInNewContext(source, { self, caches, fetch, Request, Response, URL, AbortSignal, console, Map, Promise, encodeURIComponent })
    return {
      async message(clientId, data) { let task; events.get('message')({ source: { id: clientId }, data, waitUntil(value) { task = value } }); if (task) await task },
      async navigate(clientId, path = '/dashboard') {
        let result
        // La prueba conserva el modo navigate, que Request no permite construir fuera del navegador.
        events.get('fetch')({ clientId, resultingClientId: '', request: { method: 'GET', mode: 'navigate', url: `${origin}${path}` }, respondWith(value) { result = value } })
        return await result
      },
    }
  }
  return { caches, worker, setOnline(value) { online = value }, setFailWrites(value) { failWrites = value }, setSession(value) { session = value } }
}

test('la recuperación offline mantiene el ámbito de la pestaña tras reiniciar el worker', async () => {
  const f = fixture(), first = f.worker()
  await (await f.caches.open('pos-static-v6')).addAll(['/offline.html'])
  await first.message('tab-A', { type: 'CACHE_URL', warm: true, accountId: 'account-A', userId: 'user-A', url: '/dashboard' })
  assert.equal(await (await first.navigate('tab-A')).text(), 'PÁGINA PRIVADA')
  f.setOnline(false)
  const restarted = f.worker()
  assert.equal(await (await restarted.navigate('tab-A')).text(), 'PÁGINA PRIVADA')
  assert.equal(await (await restarted.navigate('tab-B')).text(), 'OFFLINE')
  await restarted.message('tab-A', { type: 'CLEAR_SCOPE' })
  assert.equal(await (await f.worker().navigate('tab-A')).text(), 'OFFLINE')
})

test('un mensaje de otra identidad no asigna su caché y un fallo de escritura no oculta la red', async () => {
  const f = fixture(), worker = f.worker()
  await (await f.caches.open('pos-static-v6')).addAll(['/offline.html'])
  await worker.message('tab-A', { type: 'CACHE_URL', warm: true, accountId: 'account-A', userId: 'user-A', url: '/dashboard' })
  f.setSession({ accountId: 'account-B', id: 'user-B' })
  await worker.message('tab-B', { type: 'CACHE_URL', warm: true, accountId: 'account-A', userId: 'user-A', url: '/dashboard' })
  f.setFailWrites(true)
  assert.equal(await (await worker.navigate('tab-A')).text(), 'PÁGINA PRIVADA')
  f.setOnline(false)
  assert.equal(await (await worker.navigate('tab-B')).text(), 'OFFLINE')
})
