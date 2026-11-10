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
const isolated = Boolean(process.env.FISCAL_NEXT_ISOLATED_URL)
const db = new URL(process.env.FISCAL_NEXT_ISOLATED_URL || config.TEST_DATABASE_URL)
const allowedName = isolated ? /^\/cash_test_fiscal_next_\d+$/ : /^\/movopos_fiscal_test(?:_\d+)?$/
if (!['127.0.0.1', 'localhost'].includes(db.hostname) || db.port !== '55439' || !allowedName.test(db.pathname) || [...db.searchParams.keys()].some(k => k !== 'schema') || (db.searchParams.get('schema') && db.searchParams.get('schema') !== 'public')) throw new Error('Base de prueba no autorizada')
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
const preferencesOnly = process.env.FISCAL_PREFERENCES_ONLY === '1'
const stage4Only = process.env.FISCAL_STAGE4_ONLY === '1'
const stage6Only = process.env.FISCAL_STAGE6_ONLY === '1'
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
// La comprobación enfocada tiene un límite duro para respetar el presupuesto de la etapa.
const deadline = (stage4Only || stage6Only) ? setTimeout(() => {
  console.error('La comprobación HTTP agotó su tiempo máximo')
  if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio:'ignore', windowsHide:true })
  else child.kill()
  process.exit(1)
}, (process.env.FISCAL_STAGE78_OFFLINE_ONLY === '1' || process.env.FISCAL_STAGE8_REUSE_ONLY === '1') ? 70000 : 220000) : null
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
      const capabilities = await fetch('http://localhost:3100/api/fiscal/capabilities', { headers, signal: AbortSignal.timeout(30000) })
      assert.equal(capabilities.status, 200)
      const fiscal = await capabilities.json()
      assert.equal(fiscal.policy.enabled, isolated && index === 1 && !stage4Only)
      assert.equal(fiscal.operations.emit, false)
      if (stage6Only) {
        const cashier = account.users.find(user => user.username === 'cajero'); assert.ok(cashier)
        const cashierLogin = await fetch('http://localhost:3100/api/auth/subuser/login', { method:'POST', headers:{'Content-Type':'application/json','X-Clerk-Authorization':`Bearer ${token}`}, body:JSON.stringify({username:cashier.username,password:config.FISCAL_TEST_PIN}), signal:AbortSignal.timeout(30000) })
        assert.equal(cashierLogin.status,200)
        const cashierData = await cashierLogin.json()
        const denied = await fetch('http://localhost:3100/api/fiscal/documents', {headers:{'X-Clerk-Authorization':`Bearer ${token}`,'X-SubUser-Token':cashierData.token},signal:AbortSignal.timeout(30000)})
        assert.equal(denied.status,403,'El cajero sin permiso consultó la bandeja')
        sessions.push({sessionId:session.id,token:data.token,accountId:account.id,userId:owner.id})
        continue
      }
      if (stage4Only && !preferencesOnly) {
        assert.equal(fiscal.operations.preview, true)
        const web = await fetch('http://localhost:3100/api/auth/me', { headers:{ Cookie:`movopos-session=${data.token}` }, signal:AbortSignal.timeout(15000) })
        assert.equal(web.status,200,'La cookie web debe funcionar con sesión válida')
        const [head, payload, signature] = token.split('.')
        const forged = `${head}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
        const forgedResponse = await fetch('http://localhost:3100/api/auth/me', { headers:{...headers,'X-Clerk-Authorization':`Bearer ${forged}`}, signal:AbortSignal.timeout(15000) })
        assert.equal(forgedResponse.status,401,'Una firma Clerk adulterada no debe autenticarse')
        const preview = { type:'E31', issueDate:'2026-11-09', expectedPolicyVersion:fiscal.policy.version, issuer:{ name:`Emisor fiscal prueba ${index + 1}`, identification:`12345678${index + 1}`, country:'DO' }, buyer:{name:'Cliente prueba',identification:'101000001',country:'DO'}, incomeType:'01', payment:{type:'CONTADO'}, currency:{operation:'DOP',reporting:'DOP'}, lines:[{description:'Artículo de prueba',kind:'BIEN',unit:'UNIDAD',quantity:'1',unitPrice:'118.00',taxTreatment:'GRAVADO_18',priceIncludesTax:true}] }
        const sendPreview = (body, auth = headers) => fetch('http://localhost:3100/api/fiscal/documents/preview', { method:'POST', headers:{...auth,'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(30000) })
        const accepted = await sendPreview(preview); assert.equal(accepted.status,200,`Previsualización autenticada: HTTP ${accepted.status}`); assert.equal((await accepted.json()).totals.gross,'118.00')
        const absent = await sendPreview(preview, {}); assert.equal(absent.status,401)
        const bad = await sendPreview({...preview, lines:[{...preview.lines[0],quantity:'1.001'}]}); assert.equal(bad.status,422)
        if (index === 0) {
          const note = {...preview,type:'E34',issueDate:'2026-12-10',lines:[{...preview.lines[0],originalLine:1}],reference:{documentId:'stage4-reference-document',issueDate:'2026-11-09',modificationCode:'3'}}
          const boundary = await sendPreview({...note,issueDate:'2026-12-09'}); assert.equal(boundary.status,200); const at30 = await boundary.json(); assert.equal(at30.reference.creditIndicator,0); assert.equal(at30.totals.taxNotCreditable,'0.00'); assert.equal(at30.totals.net,'118.00')
          const late = await sendPreview(note)
          assert.equal(late.status,200); const doc = await late.json(); assert.equal(doc.reference.creditIndicator,1); assert.equal(doc.totals.taxNotCreditable,'18.00'); assert.equal(doc.totals.net,'100.00')
          assert.ok(doc.warnings.some(message=>message.includes('saldo pendiente')))
          // Mantener la clasificación del original evita recuperar como exento el ITBIS fuera del plazo.
          const altered = await sendPreview({...note,lines:[{...note.lines[0],taxTreatment:'EXENTO'}]}); assert.equal(altered.status,422); assert.equal((await altered.json()).error.fields[0].field,'lines.0.originalLine')
          const missingLine = await sendPreview({...note,lines:[{...preview.lines[0]}]}); assert.equal(missingLine.status,422); assert.equal((await missingLine.json()).error.fields[0].field,'lines.0.originalLine')
          const partial = await sendPreview({...note,lines:[{...note.lines[0],quantity:'0.50'}]}); assert.equal(partial.status,200); const half=await partial.json(); assert.equal(half.totals.taxNotCreditable,'9.00'); assert.equal(half.totals.net,'50.00')
        } else {
          const cross = await sendPreview({...preview,lines:[{...preview.lines[0],productId:'prod-rd-gravado'}]}); assert.equal(cross.status,404)
          const crossRef = await sendPreview({...preview,type:'E34',issueDate:'2026-12-10',reference:{documentId:'stage4-reference-document',issueDate:'2026-11-09',modificationCode:'3'}}); assert.equal(crossRef.status,404)
        }
        const cashier = account.users.find(user => user.username === 'cajero'); assert.ok(cashier)
        const cashierLogin = await fetch('http://localhost:3100/api/auth/subuser/login', { method:'POST', headers:{'Content-Type':'application/json','X-Clerk-Authorization':`Bearer ${token}`}, body:JSON.stringify({username:cashier.username,password:config.FISCAL_TEST_PIN}),signal:AbortSignal.timeout(30000) })
        assert.equal(cashierLogin.status,200); const cashierData = await cashierLogin.json()
        const denied = await sendPreview(preview, {'X-Clerk-Authorization':`Bearer ${token}`,'X-SubUser-Token':cashierData.token}); assert.equal(denied.status,403)
        sessions.push({sessionId:session.id,token:data.token,accountId:account.id,userId:owner.id})
        console.log(`Cuenta ${index+1}: previsualización HTTP autenticada, validación y permisos comprobados`)
        continue
      }
      if (preferencesOnly) {
        assert.equal(fiscal.policy.enabled, false, 'El contrato ordinario requiere el módulo apagado')
        const readCompany = () => fetch('http://localhost:3100/api/company-settings', { headers, signal: AbortSignal.timeout(30000) })
        const beforeResponse = await readCompany(); assert.equal(beforeResponse.status, 200)
        const before = await beforeResponse.json()
        for (const key of ['company', 'salesSettings', 'name', 'logoUrl', 'address', 'phone', 'defaultViewMode', 'showItbisOnReceipts', 'salePricesIncludeItbis', 'legalTipEnabled', 'defaultProfitMarginBp']) assert.ok(Object.hasOwn(before, key), `Falta campo histórico ${key}`)
        const write = await fetch('http://localhost:3100/api/company-settings', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: before.name, phone: before.phone, address: before.address, logoUrl: before.logoUrl, defaultViewMode: before.defaultViewMode, showItbisOnReceipts: before.showItbisOnReceipts, salePricesIncludeItbis: before.salePricesIncludeItbis, legalTipEnabled: before.legalTipEnabled }), signal: AbortSignal.timeout(30000) })
        assert.equal(write.status, 200, 'Falló guardar preferencias ordinarias con el contrato anterior')
        assert.deepEqual(await write.json(), before, 'Cambió el contrato o los valores ordinarios')
        assert.deepEqual(await (await readCompany()).json(), before, 'La relectura no conservó las preferencias')
        const fiscalRead = await fetch('http://localhost:3100/api/fiscal/settings', { headers, signal: AbortSignal.timeout(30000) }); assert.equal(fiscalRead.status, 200)
        const fiscalSettings = await fiscalRead.json(); assert.equal(fiscalSettings.enabled, false); assert.equal(fiscalSettings.activationAvailable, true)
        if (isolated) {
          const base = { expectedVersion: fiscalSettings.version, jurisdiction: 'DO', regime: 'DO_ECF', environment: 'TEST', legalName: 'Empresa ficticia', taxId: '123456789', fiscalAddress: 'Dirección ficticia', fiscalEmail: 'fiscal@example.test', fiscalPhone: null }
          const putFiscal = body => fetch('http://localhost:3100/api/fiscal/settings', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) })
          const invalid = await putFiscal({ ...base, legalName: null, enabled: true }); assert.equal(invalid.status, 422)
          const activate = await putFiscal({ ...base, enabled: true }); assert.equal(activate.status, 200)
          const enabled = await activate.json(); assert.equal(enabled.enabled, true); assert.equal(enabled.externalReadiness, 'NOT_CONNECTED')
          const capability = await (await fetch('http://localhost:3100/api/fiscal/capabilities', { headers, signal: AbortSignal.timeout(30000) })).json(); assert.equal(capability.policy.enabled, true)
          const deactivate = await putFiscal({ ...base, expectedVersion: enabled.version, enabled: false }); assert.equal(deactivate.status, 200); assert.equal((await deactivate.json()).enabled, false)
        }
        const cashier = account.users.find(user => user.username === 'cajero'); assert.ok(cashier)
        const cashierLogin = await fetch('http://localhost:3100/api/auth/subuser/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clerk-Authorization': `Bearer ${token}` }, body: JSON.stringify({ username: cashier.username, password: config.FISCAL_TEST_PIN }), signal: AbortSignal.timeout(30000) })
        assert.equal(cashierLogin.status, 200)
        const cashierData = await cashierLogin.json()
        const denied = await fetch('http://localhost:3100/api/fiscal/settings', { headers: { 'X-Clerk-Authorization': `Bearer ${token}`, 'X-SubUser-Token': cashierData.token }, signal: AbortSignal.timeout(30000) }); assert.equal(denied.status, 403)
        console.log(`Cuenta ${index + 1}: contrato ordinario de lectura y guardado, consulta fiscal y permiso del cajero comprobados`)
        continue
      }
      const cashContext = await fetch('http://localhost:3100/api/cash-shifts', { headers, signal: AbortSignal.timeout(30000) })
      assert.equal(cashContext.status, 200)
      const cashData = await cashContext.json()
      assert.equal(cashData.accountId, account.id)
      assert.equal(cashData.fiscalQueuePolicy.enabled, isolated && index === 1)
      assert.ok(Number.isSafeInteger(cashData.fiscalQueuePolicy.version))
      for (const endpoint of ['/api/payments', '/api/payments/batch', '/api/purchases', '/api/purchases/ocr', '/api/supplier-payments', '/api/returns', '/api/operating-expenses']) {
        const rejected = await fetch(`http://localhost:3100${endpoint}`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fiscalDocumentType: 'E34', amountCents: 1, method: 'EFECTIVO' }), signal: AbortSignal.timeout(30000),
        })
        assert.equal(rejected.status, 400)
        assert.equal((await rejected.json()).code, 'FISCAL_NOT_AVAILABLE')
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        const rejectedFiscalSale = await fetch('http://localhost:3100/api/sales', {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'E31', items: [] }), signal: AbortSignal.timeout(30000),
        })
        assert.equal(rejectedFiscalSale.status, 400)
        assert.equal((await rejectedFiscalSale.json()).code, 'FISCAL_NOT_AVAILABLE')
      }
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
      const forbiddenFiscal = await fetch('http://localhost:3100/api/fiscal/capabilities', { headers: cashierHeaders, signal: AbortSignal.timeout(30000) })
      assert.equal(forbiddenFiscal.status, 403)
      const forbiddenPurchases = await fetch('http://localhost:3100/api/purchases?skip=0&take=1', { headers: cashierHeaders, signal: AbortSignal.timeout(30000) })
      assert.equal(forbiddenPurchases.status, 403, 'El cajero sin permiso pudo consultar compras')
      console.log(`Cuenta ${index + 1}: seis listados móviles y permiso de compras del cajero comprobados`)
      const [head, payload, signature] = token.split('.')
      const forged = `${head}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
      const rejected = await fetch('http://localhost:3100/api/auth/me', { headers: { ...headers, 'X-Clerk-Authorization': `Bearer ${forged}` }, signal: AbortSignal.timeout(15000) })
      assert.equal(rejected.status, 401, 'Se aceptó una firma Clerk falsa')
      sessions.push({ sessionId: session.id, token: data.token, accountId: account.id, userId: owner.id })
      console.log(`Cuenta ${index + 1}: inicio, sesión móvil y cookie web válidos; PIN y firma incorrectos rechazados`)
    }
    if (!preferencesOnly) for (let index = 0; index < 2; index++) {
      // Una sesión vencida también devuelve 401: comprobar primero que el token fresco sí funciona.
      const token = (await clerk.sessions.getToken(sessions[index].sessionId)).jwt
      const headers = { Authorization: `Bearer ${token}`, 'X-SubUser-Token': sessions[index].token }
      const own = await fetch('http://localhost:3100/api/auth/me', { headers, signal: AbortSignal.timeout(15000) })
      assert.equal(own.status, 200, 'La sesión propia no funciona antes del cruce')
      const crossed = await fetch('http://localhost:3100/api/auth/me', { headers: { ...headers, 'X-SubUser-Token': sessions[1-index].token }, signal: AbortSignal.timeout(15000) })
      assert.equal(crossed.status, 401, 'Next permitió cruzar sesiones entre empresas')
      const crossedFiscal = await fetch('http://localhost:3100/api/fiscal/capabilities', { headers: { ...headers, 'X-SubUser-Token': sessions[1-index].token }, signal: AbortSignal.timeout(15000) })
      assert.equal(crossedFiscal.status, 401, 'Se aceptó una sesión cruzada al consultar capacidades fiscales')
    }
    if (!preferencesOnly) console.log('Next real rechazó ambas sesiones cruzadas entre empresas')
    if (isolated && !preferencesOnly && stage4Only) {
      const { runRealOffline } = await import('./fiscal-offline-real.browser.mjs')
      const freshHeaders = async () => ({ 'X-Clerk-Authorization': `Bearer ${(await clerk.sessions.getToken(sessions[0].sessionId)).jwt}`, 'X-SubUser-Token': sessions[0].token })
      await runRealOffline({ dbUrl: db.toString(), accountId:sessions[0].accountId, userId:sessions[0].userId, freshHeaders })
    }
    if (isolated && stage6Only && process.env.FISCAL_STAGE8_REUSE_ONLY === '1') {
      const { runStage8ExistingChecks } = await import('./fiscal-stage8-existing-check.mjs')
      await runStage8ExistingChecks({ sessions, clerk, dbUrl: db.toString() })
    } else if (isolated && stage6Only && process.env.FISCAL_STAGE78_OFFLINE_ONLY === '1') {
      const { runRealOffline } = await import('./fiscal-offline-real.browser.mjs')
      const freshHeaders = async () => ({ 'X-Clerk-Authorization': `Bearer ${(await clerk.sessions.getToken(sessions[1].sessionId)).jwt}`, 'X-SubUser-Token': sessions[1].token })
      await runRealOffline({ dbUrl: db.toString(), accountId:sessions[1].accountId, userId:sessions[1].userId, freshHeaders, fiscal:true })
    } else if (isolated && stage6Only) {
      const { runStage6Checks } = await import('./fiscal-stage6-real-check.mjs')
      await runStage6Checks({ sessions, clerk, dbUrl: db.toString() })
    }
    if (isolated && !preferencesOnly && !stage4Only && !stage6Only) {
      const credentials = await Promise.all(sessions.map(async s => ({ 'X-Clerk-Authorization': `Bearer ${(await clerk.sessions.getToken(s.sessionId)).jwt}`, 'X-SubUser-Token': s.token, 'Content-Type': 'application/json' })))
      const read = new PrismaClient({ datasources: { db: { url: db.toString() } } })
      try {
        const [simultaneousA, simultaneousB] = await Promise.all(credentials.map(headers => fetch('http://localhost:3100/api/fiscal/capabilities', { headers, signal: AbortSignal.timeout(30000) })))
        assert.equal(simultaneousA.status, 200); assert.equal(simultaneousB.status, 200)
        assert.equal((await simultaneousA.json()).policy.enabled, false)
        assert.equal((await simultaneousB.json()).policy.enabled, true)
        const cases = [
          { product: 'prod-rd-gravado', box: 'treasury-rd-caja', price: 10000 },
          { product: 'prod-doprep-item', box: 'treasury-doprep-caja', price: 15000 },
        ]
        const count = index => read.sale.count({ where: { accountId: sessions[index].accountId } })
        const before = await Promise.all([count(0), count(1)])
        const stockBefore = await Promise.all(cases.map(c => read.product.findUniqueOrThrow({ where: { id: c.product }, select: { stock: true } })))
        const payload = i => ({ customerId: null, type: 'CONTADO', paymentMethod: 'EFECTIVO', treasuryAccountId: cases[i].box, items: [{ productId: cases[i].product, qty: 1, unitPriceCents: cases[i].price, wasPriceOverridden: false }] })
        const id = `http-fiscal-test-${randomBytes(12).toString('hex')}`
        const bodyA = { kind: 'sale', payload: payload(0), cashOperation: { accountId: sessions[0].accountId, userId: sessions[0].userId, clientOperationId: id, cashShiftId: null, clientSequence: null, fiscalPolicyVersion: 0 } }
        const sendA = () => fetch('http://localhost:3100/api/cash-shifts/operations', { method: 'POST', headers: credentials[0], body: JSON.stringify(bodyA), signal: AbortSignal.timeout(30000) })
        const [first, forbidden] = await Promise.all([sendA(), fetch('http://localhost:3100/api/sales', { method: 'POST', headers: credentials[1], body: JSON.stringify(payload(1)), signal: AbortSignal.timeout(30000) })])
        assert.equal(first.status, 200, 'La empresa ordinaria no pudo vender')
        assert.equal(forbidden.status, 409, 'Una empresa con perfil activo no puede omitir las reglas fiscales')
        assert.equal((await forbidden.json()).code, 'FISCAL_NOT_AVAILABLE')
        const original = await first.json(), retry = await sendA()
        assert.equal(retry.status, 200); assert.equal((await retry.json()).result.id, original.result.id)
        assert.deepEqual(await Promise.all([count(0), count(1)]), [before[0] + 1, before[1]])
        const stockAfter = await Promise.all(cases.map(c => read.product.findUniqueOrThrow({ where: { id: c.product }, select: { stock: true } })))
        assert.equal(Number(stockAfter[0].stock), Number(stockBefore[0].stock) - 1)
        assert.equal(Number(stockAfter[1].stock), Number(stockBefore[1].stock))
        const staleBody = { ...bodyA, cashOperation: { ...bodyA.cashOperation, clientOperationId: `${id}-stale`, fiscalPolicyVersion: 999 } }
        const stale = await fetch('http://localhost:3100/api/cash-shifts/operations', { method: 'POST', headers: credentials[0], body: JSON.stringify(staleBody), signal: AbortSignal.timeout(30000) })
        assert.equal(stale.status, 409); assert.equal((await stale.json()).code, 'FISCAL_POLICY_CHANGED')
        assert.equal(await count(0), before[0] + 1)
        const cross = await fetch('http://localhost:3100/api/cash-shifts/operations', { method: 'POST', headers: credentials[1], body: JSON.stringify(bodyA), signal: AbortSignal.timeout(30000) })
        assert.equal(cross.status, 403, 'Una empresa no puede recuperar el pendiente de otra')
        const reviewId = `${id}-review`
        const reviewBody = { kind: 'discard', cashOperation: { ...bodyA.cashOperation, clientOperationId: reviewId }, payload: { reason: 'Conciliado en fixture', originalKind: 'legacy-sale', originalPayload: { accountId: sessions[0].accountId, userId: sessions[0].userId, tempId: 'legacy-fixture' } } }
        const review = () => fetch('http://localhost:3100/api/cash-shifts/operations', { method: 'POST', headers: credentials[0], body: JSON.stringify(reviewBody), signal: AbortSignal.timeout(30000) })
        const reviewed = await review(); assert.equal(reviewed.status, 200); assert.equal((await reviewed.json()).result.discarded, true)
        const reviewedAgain = await review(); assert.equal(reviewedAgain.status, 200); assert.equal((await reviewedAgain.json()).result.discarded, true)
        assert.equal(await read.auditLog.count({ where: { accountId: sessions[0].accountId, resourceType: 'CashPendingDiscard', resourceId: reviewId } }), 1)
        assert.equal(await count(0), before[0] + 1)
        console.log('Políticas distintas: venta ordinaria, bloqueo activo, reintento y aislamiento HTTP comprobados')
      } finally { await read.$disconnect() }
    }
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
  if (deadline) clearTimeout(deadline)
  // Detener solo el proceso de Next creado por esta ejecución.
  if (!exited && process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else if (!exited) child.kill()
}
