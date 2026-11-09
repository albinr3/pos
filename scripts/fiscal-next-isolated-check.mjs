import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import { randomBytes, createPublicKey } from 'node:crypto'
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import { createClerkClient } from '@clerk/backend'
import { PrismaClient } from '@prisma/client'

const config = dotenv.parse(fs.readFileSync('.env.fiscal-test'))
// Next puede actualizar su tsconfig al arrancar; nunca usar el del proyecto real.
fs.copyFileSync('tsconfig.json', 'tsconfig.fiscal-test.json')
const db = new URL(config.TEST_DATABASE_URL)
if (!['127.0.0.1', 'localhost'].includes(db.hostname) || db.port !== '55439' || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(db.pathname) || [...db.searchParams.keys()].some(k => k !== 'schema') || (db.searchParams.get('schema') && db.searchParams.get('schema') !== 'public')) throw new Error('Base de prueba no autorizada')
// El cliente nativo de Prisma usa exclusivamente esta IP local validada.
db.hostname = '127.0.0.1'
const env = {}
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC', 'USERPROFILE']) if (process.env[key]) env[key] = process.env[key]
// Next carga los .env automáticamente: anular todas sus variables antes de iniciarlo.
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) if (fs.existsSync(file)) for (const key of Object.keys(dotenv.parse(fs.readFileSync(file)))) env[key] = ''
Object.assign(env, {
  DATABASE_URL: db.toString(), JWT_SECRET: randomBytes(32).toString('hex'),
  CLERK_SECRET_KEY: config.CLERK_SECRET_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: config.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  FISCAL_TEST_MODE: '1', FISCAL_TEST_TRACE_NODE: '1', NEXT_TELEMETRY_DISABLED: '1',
  NODE_OPTIONS: `--require="${path.resolve('scripts/fiscal-test-network-guard.cjs').replaceAll('\\', '/')}"`,
})
if (!env.CLERK_SECRET_KEY?.startsWith('sk_live_') || config.FISCAL_TEST_ALLOW_LIVE_IDENTITY_LOOKUP !== 'true') throw new Error('Configuración Clerk no autorizada')
const authenticated = process.argv.includes('--authenticated')
const identities = [config.FISCAL_TEST_CLERK_USER_A, config.FISCAL_TEST_CLERK_USER_B]
let clerk, accounts
if (authenticated) {
  if (identities.some(id => !/^user_[a-zA-Z0-9]+$/.test(id || '')) || identities[0] === identities[1]) throw new Error('Identidades de prueba no válidas')
  const prisma = new PrismaClient({ datasources: { db: { url: db.toString() } } })
  try {
    accounts = await prisma.account.findMany({ where: { clerkUserId: { in: identities } }, include: { users: true } })
    assert.equal(accounts.length, 2, 'Faltan las empresas de prueba')
  } finally { await prisma.$disconnect() }
  clerk = createClerkClient({ secretKey: config.CLERK_SECRET_KEY })
  const { keys } = await clerk.jwks.getJwks()
  if (!keys?.length) throw new Error('Clerk no devolvió claves públicas')
  // Resolver la clave pública fuera del servidor aislado evita abrirle salida a Clerk.
  const list = await clerk.sessions.getSessionList({ userId: identities[0], status: 'active', limit: 10 })
  const session = list.data.find(s => s.userId === identities[0] && s.status === 'active')
  if (!session) throw new Error('Falta sesión temporal: usar fiscal-test:next')
  const token = (await clerk.sessions.getToken(session.id)).jwt
  const kid = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).kid
  const key = keys.find(key => key.kid === kid)
  if (!key || key.kty !== 'RSA') throw new Error('Clave pública de sesión no disponible')
  env.CLERK_JWT_KEY = createPublicKey({ key, format: 'jwk' }).export({ type: 'spki', format: 'pem' }).toString()
}
// Evitar confundir otra aplicación local con el servidor de esta prueba.
const probe = net.createServer()
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(3100, 'localhost', resolve) })
await new Promise(resolve => probe.close(resolve))
// Next normaliza las IP de loopback a localhost dentro del middleware. Clerk añade
// una reescritura a esa URL: usar 127.0.0.1 aquí la convierte en un proxy circular.
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', 'localhost', '--port', '3100'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let output = ''
child.stdout.on('data', chunk => { if (output.length < 200000) output += chunk.toString() })
child.stderr.on('data', chunk => { if (output.length < 200000) output += chunk.toString() })
let exited = false
child.once('exit', () => { exited = true })
try {
  const limit = Date.now() + 45000
  let response
  while (Date.now() < limit && !exited) {
    try { response = await fetch('http://localhost:3100/api/auth/me', { signal: AbortSignal.timeout(15000) }); break } catch { await new Promise(resolve => setTimeout(resolve, 1000)) }
  }
  if (!response) throw new Error(exited ? 'Next terminó antes de responder' : 'Next no respondió a tiempo')
  if (![401, 403].includes(response.status)) throw new Error(`La ruta sin autenticación devolvió HTTP ${response.status}`)
  console.log(`Next real respondió HTTP ${response.status} y rechazó la solicitud sin sesión`)
  if (authenticated) {
    const sessions = []
    for (const [index, identity] of identities.entries()) {
      const account = accounts.find(account => account.clerkUserId === identity)
      const owner = account.users.find(user => user.isOwner)
      assert.ok(owner, 'Falta dueño de prueba')
      const list = await clerk.sessions.getSessionList({ userId: identity, status: 'active', limit: 10 })
      const session = list.data.find(s => s.userId === identity && s.status === 'active')
      assert.ok(session, 'Falta sesión Clerk de prueba')
      const token = (await clerk.sessions.getToken(session.id)).jwt
      const wrongPin = await fetch('http://localhost:3100/api/auth/subuser/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clerk-Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username: owner.username, password: 'pin-incorrecto-de-prueba' }), signal: AbortSignal.timeout(30000),
      })
      assert.equal(wrongPin.status, 401, 'El inicio aceptó un PIN incorrecto')
      const login = await fetch('http://localhost:3100/api/auth/subuser/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clerk-Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username: owner.username, password: config.FISCAL_TEST_PIN }), signal: AbortSignal.timeout(30000),
      })
      assert.equal(login.status, 200, `Inicio de cuenta ${index + 1}: HTTP ${login.status}`)
      const data = await login.json()
      assert.equal(data.user.id, owner.id)
      assert.equal(data.user.accountId, account.id)
      assert.ok(data.token)
      const headers = { 'X-Clerk-Authorization': `Bearer ${token}`, 'X-SubUser-Token': data.token }
      const me = await fetch('http://localhost:3100/api/auth/me', { headers, signal: AbortSignal.timeout(15000) })
      assert.equal(me.status, 200)
      const current = await me.json()
      assert.equal(current.user.id, owner.id)
      assert.equal(current.user.accountId, account.id)
      const cookie = await fetch('http://localhost:3100/api/auth/me', { headers: { Cookie: `movopos-session=${data.token}` }, signal: AbortSignal.timeout(15000) })
      assert.equal(cookie.status, 200, 'No se aceptó la cookie web válida')
      assert.equal((await cookie.json()).user.id, owner.id)
      // Estas consultas son de solo lectura; las mutaciones comerciales requieren
      // además aislamiento del navegador y de los procesos nativos.
      for (const route of ['/api/sales', '/api/returns', '/api/payments', '/api/purchases', '/api/supplier-payments', '/api/operating-expenses']) {
        const list = await fetch(`http://localhost:3100${route}?skip=0&take=1`, { headers, signal: AbortSignal.timeout(60000) })
        assert.equal(list.status, 200, `${route}: consulta móvil de dueño falló`)
        const body = await list.json()
        assert.ok(Array.isArray(body.data), `${route}: falta la lista`)
        assert.ok(Object.hasOwn(body, 'nextSkip'), `${route}: falta paginación`)
      }
      const cashier = account.users.find(user => user.username === 'cajero')
      assert.ok(cashier, 'Falta cajero de prueba')
      const cashierLogin = await fetch('http://localhost:3100/api/auth/subuser/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clerk-Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username: cashier.username, password: config.FISCAL_TEST_PIN }), signal: AbortSignal.timeout(30000),
      })
      assert.equal(cashierLogin.status, 200, 'No inició el cajero de prueba')
      const cashierData = await cashierLogin.json()
      assert.equal(cashierData.user.id, cashier.id)
      const cashierHeaders = { 'X-Clerk-Authorization': `Bearer ${token}`, 'X-SubUser-Token': cashierData.token }
      const forbiddenPurchases = await fetch('http://localhost:3100/api/purchases?skip=0&take=1', { headers: cashierHeaders, signal: AbortSignal.timeout(30000) })
      assert.equal(forbiddenPurchases.status, 403, 'El cajero sin permiso pudo consultar compras')
      console.log(`Cuenta ${index + 1}: seis listados móviles y permiso de compras del cajero comprobados`)
      const [head, payload, signature] = token.split('.')
      const forged = `${head}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
      const rejected = await fetch('http://localhost:3100/api/auth/me', { headers: { ...headers, 'X-Clerk-Authorization': `Bearer ${forged}` }, signal: AbortSignal.timeout(15000) })
      assert.equal(rejected.status, 401, 'Se aceptó una firma Clerk falsa')
      sessions.push({ sessionId: session.id, token: data.token })
      console.log(`Cuenta ${index + 1}: inicio, sesión móvil y cookie web válidos; PIN y firma incorrectos rechazados`)
    }
    for (let index = 0; index < 2; index++) {
      // Una sesión vencida también devuelve 401: comprobar primero que el token fresco sí funciona.
      const token = (await clerk.sessions.getToken(sessions[index].sessionId)).jwt
      const headers = { Authorization: `Bearer ${token}`, 'X-SubUser-Token': sessions[index].token }
      const own = await fetch('http://localhost:3100/api/auth/me', { headers, signal: AbortSignal.timeout(15000) })
      assert.equal(own.status, 200, 'La sesión propia no funciona antes del cruce')
      const crossed = await fetch('http://localhost:3100/api/auth/me', { headers: { ...headers, 'X-SubUser-Token': sessions[1-index].token }, signal: AbortSignal.timeout(15000) })
      assert.equal(crossed.status, 401, 'Next permitió cruzar sesiones entre empresas')
    }
    console.log('Next real rechazó ambas sesiones cruzadas entre empresas')
  }
} catch (error) {
  console.error(error.message)
  // No imprimir la salida de Next: podría contener información de la configuración.
  fs.writeFileSync('tmp/fiscal-next-diagnostic.log', output, { mode: 0o600 })
  if (output.includes('FISCAL_TEST_NETWORK_BLOCKED') || output.includes('Conexión bloqueada')) console.error('Se detectó un intento de salida bloqueado por la defensa Node')
  for (const match of new Set(output.match(/Conexión bloqueada por el entorno fiscal de prueba \((?:socket|local|externa):(?:\d+|sin-puerto)\)/g) || [])) console.error(match)
  for (const match of new Set(output.match(/Fiscal red: (?:local|otra):(?:\d+|sin-puerto)/g) || [])) console.error(match)
  for (const marker of ['Starting...', 'Ready in', 'Compiling', 'Error:', 'EADDRINUSE']) if (output.includes(marker)) console.error(`Registro de Next contiene: ${marker}`)
  process.exitCode = 1
} finally {
  // Detener solo el proceso de Next creado por esta ejecución.
  if (!exited && process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else if (!exited) child.kill()
}
