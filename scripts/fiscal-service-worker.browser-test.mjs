// Chrome y HTTP locales: sesión ficticia y sin acceso a servicios externos.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const browser = [process.env.CASH_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(file => fs.existsSync(file))
if (!browser) throw Error('No hay navegador disponible')
const sw = fs.readFileSync('public/sw.js')
let session = { accountId: 'empresa-A', id: 'empleado-A' }, serverOnline = true
const server = http.createServer((req, res) => {
  // El modo offline de DevTools puede no afectar las conexiones iniciadas por el worker.
  if (!serverOnline) { req.socket.destroy(); return }
  res.setHeader('Cache-Control', 'no-store')
  if (req.url === '/sw.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(sw) }
  if (req.url === '/api/auth/me') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ user: session })) }
  if (req.url === '/offline.html') { res.setHeader('Content-Type', 'text/html'); return res.end('<body>OFFLINE</body>') }
  res.setHeader('Content-Type', 'text/html'); res.end(`<body>${req.url === '/dashboard' ? `PRIVADO-${session.accountId}` : 'INICIO'}</body>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port, profile = path.resolve('tmp', `fiscal-sw-profile-${Date.now()}`)
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-quic', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  let address
  for (let i = 0; i < 150; i++) { try { const lines = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/); if (lines.length === 2) { address = lines; break } } catch {} await delay(100) }
  if (!address) throw Error('Chrome no inició')
  socket = new WebSocket(`ws://127.0.0.1:${address[0]}${address[1]}`)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  const calls = new Map(); let id = 0
  socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { const pending = calls.get(message.id); calls.delete(message.id); if (message.error) pending.reject(Error(message.error.message)); else pending.resolve(message.result) } }
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const next = ++id; calls.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params, ...(sessionId ? { sessionId } : {}) })) })
  const { targetId } = await call('Target.createTarget', { url: `http://localhost:${port}/` })
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
  await call('Page.enable', {}, sessionId); await call('Network.enable', {}, sessionId); await call('ServiceWorker.enable', {}, sessionId)
  const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value }
  // about:blank también está completo: esperar al origen local antes de registrar el worker.
  for (let i = 0; i < 100 && !(await evaluate(`location.origin === ${JSON.stringify(`http://localhost:${port}`)} && document.readyState === "complete"`)); i++) await delay(100)
  await evaluate("navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)")
  await call('Page.reload', {}, sessionId)
  for (let i = 0; i < 100 && !(await evaluate('!!navigator.serviceWorker.controller')); i++) await delay(100)
  assert.equal(await evaluate('!!navigator.serviceWorker.controller'), true)
  await evaluate("navigator.serviceWorker.controller.postMessage({type:'CACHE_URL',warm:true,accountId:'empresa-A',userId:'empleado-A',url:'/dashboard'})")
  let cached = false
  for (let i = 0; i < 100; i++) { cached = await evaluate("caches.open('pos-navigation-v6-empresa-A:empleado-A').then(c => c.match('/dashboard')).then(Boolean)"); if (cached) break; await delay(100) }
  assert.equal(cached, true, 'La caché privada debe precargarse con la sesión correcta')
  const { targetId: otherTarget } = await call('Target.createTarget', { url: `http://localhost:${port}/` })
  const { sessionId: otherSession } = await call('Target.attachToTarget', { targetId: otherTarget, flatten: true })
  await call('Page.enable', {}, otherSession); await call('Network.enable', {}, otherSession)
  const otherEval = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, otherSession); if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result.value }
  for (let i = 0; i < 100 && !(await otherEval(`location.origin === ${JSON.stringify(`http://localhost:${port}`)} && !!navigator.serviceWorker.controller`)); i++) await delay(100)
  assert.equal(await otherEval('!!navigator.serviceWorker.controller'), true)
  // Una pestaña no puede declarar otra identidad si la sesión del servidor no coincide.
  await otherEval("navigator.serviceWorker.controller.postMessage({type:'CACHE_URL',warm:true,accountId:'empresa-B',userId:'empleado-B',url:'/dashboard'})")
  await delay(300)
  // Detener el proceso del worker obliga a recuperar el contexto desde CacheStorage.
  await call('ServiceWorker.stopAllWorkers', {}, sessionId)
  serverOnline = false
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, sessionId)
  await call('Page.navigate', { url: `http://localhost:${port}/dashboard` }, sessionId)
  let body = ''
  for (let i = 0; i < 100; i++) { body = await evaluate('document.body?.innerText || ""'); if (body.includes('PRIVADO-empresa-A')) break; await delay(100) }
  assert.match(body, /PRIVADO-empresa-A/, 'El worker reiniciado debe recuperar la caché de la pestaña')
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, otherSession)
  await call('Page.navigate', { url: `http://localhost:${port}/dashboard` }, otherSession)
  let otherBody = ''
  for (let i = 0; i < 100; i++) { otherBody = await otherEval('document.body?.innerText || ""'); if (otherBody.includes('OFFLINE')) break; await delay(100) }
  assert.match(otherBody, /OFFLINE/, 'Una pestaña sin identidad válida no debe recibir la caché privada')
  console.log('PASS Service worker real: reinicio, aislamiento de pestañas y navegación offline')
  await call('Browser.close').catch(() => {})
} finally {
  socket?.close()
  if (child.exitCode === null) child.kill()
  await new Promise(resolve => server.close(resolve))
}
