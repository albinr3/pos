// Sesiones temporales solo para las dos identidades de prueba; no toca sesiones existentes.
import fs from 'node:fs'
import dotenv from 'dotenv'
import { spawnSync } from 'node:child_process'
import { createClerkClient } from '@clerk/backend'
import { PrismaClient } from '@prisma/client'

const c = dotenv.parse(fs.readFileSync('.env.fiscal-test'))
const identities = [c.FISCAL_TEST_CLERK_USER_A, c.FISCAL_TEST_CLERK_USER_B]
const dbUrl = new URL(c.TEST_DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname) || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(dbUrl.pathname) || !c.CLERK_SECRET_KEY?.startsWith('sk_live_') || c.FISCAL_TEST_ALLOW_LIVE_IDENTITY_LOOKUP !== 'true' || identities.some(id => !/^user_[a-zA-Z0-9]+$/.test(id || '')) || identities[0] === identities[1]) throw new Error('Identidades o base de prueba no autorizadas')
const domain = Buffer.from(c.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.split('_').slice(2).join('_'), 'base64').toString('utf8').replace(/\$$/, '')
if (domain !== 'clerk.movopos.com') throw new Error('Dominio Clerk inesperado')
const db = new PrismaClient({ datasources: { db: { url: dbUrl.toString() } } })
try {
  const accounts = await db.account.findMany({ where: { clerkUserId: { in: identities } }, select: { id: true } })
  if (accounts.length !== 2) throw new Error('Las identidades no están vinculadas a la base de prueba')
} finally { await db.$disconnect() }

const clerk = createClerkClient({ secretKey: c.CLERK_SECRET_KEY })
const tickets = [], sessions = []
try {
  for (const id of identities) {
    const existing = await clerk.sessions.getSessionList({ userId: id, status: 'active', limit: 10 })
    if (existing.data.some(session => session.userId === id && session.status === 'active')) continue
    const ticket = await clerk.signInTokens.createSignInToken({ userId: id, expiresInSeconds: 60 })
    tickets.push(ticket)
    if (ticket.userId !== id || !ticket.token) throw new Error('La identidad del ticket no coincide')
    const response = await fetch(`https://${domain}/v1/client/sign_ins?_clerk_js_version=5.0.0`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://accounts.movopos.com' },
      body: new URLSearchParams({ strategy: 'ticket', ticket: ticket.token }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(`Clerk rechazó el acceso (HTTP ${response.status})`)
    const attempt = data.response
    if (attempt?.status !== 'complete' || !attempt.created_session_id) throw new Error('El acceso requiere una verificación adicional')
    const session = await clerk.sessions.getSession(attempt.created_session_id)
    if (session.userId !== id) throw new Error('La sesión no pertenece a la cuenta de prueba')
    sessions.push(session)
  }
  console.log('Comprobando las dos cuentas de prueba')
  const args = process.argv.includes('--next')
    ? ['scripts/fiscal-next-isolated-check.mjs', '--authenticated']
    : ['node_modules/tsx/dist/cli.mjs', 'scripts/fiscal-clerk-live-check.mts']
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true })
  if (result.error || result.status !== 0) process.exitCode = 1
} catch (error) {
  console.error(`No se pudo completar la prueba temporal (${error?.status || error?.name || 'error'})`)
  process.exitCode = 1
} finally {
  // No revocar ninguna sesión que existiera antes de esta prueba.
  for (const session of sessions) if (identities.includes(session.userId)) try { await clerk.sessions.revokeSession(session.id); console.log('Sesión temporal de prueba cerrada') } catch { console.error('No se pudo cerrar la sesión temporal'); process.exitCode = 1 }
  for (const ticket of tickets) if (identities.includes(ticket.userId)) try { await clerk.signInTokens.revokeSignInToken(ticket.id) } catch { /* Puede estar ya consumido. */ }
}
