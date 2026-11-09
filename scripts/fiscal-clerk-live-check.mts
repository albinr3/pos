// Solo consulta sesiones existentes de los dos usuarios de prueba autorizados.
import fs from "node:fs"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import http from "node:http"
import dotenv from "dotenv"
import { createClerkClient } from "@clerk/backend"
import { NextRequest } from "next/server"

const config = dotenv.parse(fs.readFileSync(".env.fiscal-test"))
const dbUrl = new URL(config.TEST_DATABASE_URL)
const identities = [config.FISCAL_TEST_CLERK_USER_A, config.FISCAL_TEST_CLERK_USER_B]
if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname) || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(dbUrl.pathname) || identities.some(id => !/^user_[a-zA-Z0-9]+$/.test(id || "")) || identities[0] === identities[1] || !config.CLERK_SECRET_KEY?.startsWith("sk_live_") || config.FISCAL_TEST_ALLOW_LIVE_IDENTITY_LOOKUP !== "true") throw new Error("Configuración de prueba no autorizada")

// Evitar que cualquier módulo cargue la base habitual o credenciales de proveedores externos.
for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) if (fs.existsSync(file)) for (const key of Object.keys(dotenv.parse(fs.readFileSync(file)))) {
  if (/^(LEMON|RESEND|WHATSAPP|UPLOADTHING|OPENAI|SUPABASE|KAPSO|META|EXPO|DATABASE_URL_PROD)/i.test(key)) process.env[key] = ""
}
process.env.DATABASE_URL = dbUrl.toString()
process.env.JWT_SECRET = randomBytes(32).toString("hex")
process.env.CLERK_SECRET_KEY = config.CLERK_SECRET_KEY
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = config.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
delete process.env.CLERK_JWT_KEY
delete process.env.CLERK_AUTHORIZED_PARTIES

const clerk = createClerkClient({ secretKey: config.CLERK_SECRET_KEY })
const { prisma } = await import("../src/lib/db")
const { createSubUserSession } = await import("../src/lib/auth")
const { POST: login } = await import("../src/app/api/auth/subuser/login/route")
const { GET: me } = await import("../src/app/api/auth/me/route")
const { GET: customers, POST: createCustomer } = await import("../src/app/api/customers/route")
const { GET: products } = await import("../src/app/api/products/route")
const { GET: sales } = await import("../src/app/api/sales/route")
// Servidor solo local con handlers explícitos: no expone rutas de integración externa.
const server = http.createServer(async (req, res) => {
  try {
    const route = req.url?.split("?")[0]
    const getHandlers: Record<string, (r: NextRequest) => Promise<Response>> = { "/api/auth/me": me, "/api/customers": customers, "/api/products": products, "/api/sales": sales }
    if (!((route === "/api/auth/subuser/login" && req.method === "POST") || (route === "/api/customers" && req.method === "POST") || (route && getHandlers[route] && req.method === "GET"))) { res.writeHead(404).end(); return }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value)
    const request = new NextRequest(`http://127.0.0.1${req.url}`, { method: req.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
    const response = req.method === "POST" ? await (route === "/api/customers" ? createCustomer(request) : login(request)) : await getHandlers[route!](request)
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
  } catch { res.writeHead(500).end() }
})
await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
const address = server.address()
if (!address || typeof address === "string") throw new Error("Servidor de prueba no disponible")
const base = `http://127.0.0.1:${address.port}`
const originalLog = console.log
const originalInfo = console.info
let failed = false
try {
  const accounts = await prisma.account.findMany({ where: { clerkUserId: { in: identities } }, include: { users: true, customers: true, products: true } })
  assert.equal(accounts.length, 2)
  let tested = 0
  for (let i = 0; i < identities.length; i++) {
    const id = identities[i]
    const account = accounts.find(a => a.clerkUserId === id)
    const otherAccount = accounts.find(a => a.clerkUserId === identities[1-i])
    assert.ok(account); assert.ok(otherAccount)
    const owner = account.users.find(user => user.isOwner)
    const otherOwner = otherAccount.users.find(user => user.isOwner)
    const cashier = account.users.find(user => user.username === "cajero" && !user.isOwner)
    assert.ok(owner); assert.ok(otherOwner); assert.ok(cashier)
    const list = await clerk.sessions.getSessionList({ userId: id, status: "active", limit: 10 })
    const session = list.data.find(s => s.userId === id && s.status === "active")
    if (!session) { originalLog(`Cuenta de prueba ${i+1}: sin sesión Clerk activa`); continue }
    const token = (await clerk.sessions.getToken(session.id)).jwt
    assert.ok(token)
    // Los módulos heredados registran datos del usuario; no reproducirlos en la salida de pruebas.
    console.log = () => {}
    const response = await fetch(`${base}/api/auth/subuser/login`, { method: "POST", headers: { "X-Clerk-Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ username: owner.username, password: config.FISCAL_TEST_PIN }) })
    console.log = originalLog
    assert.equal(response.status, 200, "Falló el inicio de sesión del subusuario")
    const data = await response.json()
    assert.equal(data.user.id, owner.id)
    assert.ok(data.token)
    const headers = { "X-Clerk-Authorization": `Bearer ${token}`, "X-SubUser-Token": data.token }
    const good = await fetch(`${base}/api/auth/me`, { headers })
    assert.equal(good.status, 200)
    for (const [route, own, foreign] of [
      ["/api/customers", account.customers, otherAccount.customers],
      ["/api/products", account.products, otherAccount.products],
    ] as const) {
      const response = await fetch(`${base}${route}`, { headers })
      assert.equal(response.status, 200, `Falló ${route}`)
      const payload = await response.json() as { data: { id: string }[] }
      const returned = new Set(payload.data.map(item => item.id))
      for (const item of own) assert.ok(returned.has(item.id), `Falta un registro propio en ${route}`)
      for (const item of foreign) assert.ok(!returned.has(item.id), `Se filtró un registro de otra empresa en ${route}`)
    }
    const salesResponse = await fetch(`${base}/api/sales`, { headers })
    assert.equal(salesResponse.status, 200, "No se pudieron consultar las ventas")
    const crossToken = await createSubUserSession(otherAccount.id, otherOwner.id)
    const other = await fetch(`${base}/api/auth/me`, { headers: { ...headers, "X-SubUser-Token": crossToken } })
    assert.equal(other.status, 401, "No debe aceptar sesiones de otra empresa")
    console.log = () => {}
    const cashierLogin = await fetch(`${base}/api/auth/subuser/login`, { method: "POST", headers: { "X-Clerk-Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ username: cashier.username, password: config.FISCAL_TEST_PIN }) })
    console.log = originalLog
    assert.equal(cashierLogin.status, 200)
    const cashierData = await cashierLogin.json()
    assert.equal(cashierData.user.id, cashier.id)
    console.info = () => {}
    console.log = () => {}
    const denied = await fetch(`${base}/api/customers`, { method: "POST", headers: { "X-Clerk-Authorization": `Bearer ${token}`, "X-SubUser-Token": cashierData.token, "Content-Type": "application/json" }, body: "{}" })
    console.info = originalInfo
    console.log = originalLog
    assert.equal(denied.status, 403, "El cajero no debe poder crear clientes")
    tested++
    originalLog(`Cuenta de prueba ${i+1}: Clerk, usuarios, consultas, permisos y acceso cruzado verificados`)
  }
  if (tested !== 2) { originalLog(`Quedan ${2-tested} cuentas sin sesión Clerk activa`); failed = true }
} catch (error) {
  console.log = originalLog
  console.info = originalInfo
  const details = error as { name?: unknown; status?: unknown; errors?: { code?: unknown }[] }
  console.error(`Prueba Clerk incompleta (${typeof details?.name === "string" ? details.name : "error"}; estado ${typeof details?.status === "number" ? details.status : "desconocido"}; código ${typeof details?.errors?.[0]?.code === "string" ? details.errors[0].code : "desconocido"})`)
  failed = true
} finally {
  console.log = originalLog
  await new Promise<void>(resolve => server.close(() => resolve()))
  await prisma.$disconnect()
}
if (failed) process.exitCode = 1
