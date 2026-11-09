// Prueba de seguridad local: firma RSA ficticia y datos de prueba, sin conectar con Clerk.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { generateKeyPairSync, randomBytes } from "node:crypto"
import dotenv from "dotenv"
import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"

const config = dotenv.parse(fs.readFileSync(".env.fiscal-test"))
const url = new URL(config.TEST_DATABASE_URL)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/movopos_fiscal_test(?:_\d+)?$/.test(url.pathname) || [...url.searchParams.keys()].some(key => key !== 'schema')) throw new Error("Se requiere una base local fiscal de prueba")
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const badKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
process.env.DATABASE_URL = url.toString()
process.env.JWT_SECRET = randomBytes(32).toString("hex")
process.env.CLERK_SECRET_KEY = "sk_test_fixture"
process.env.CLERK_JWT_KEY = publicKey.export({ type: "spki", format: "pem" }).toString()
delete process.env.CLERK_AUTHORIZED_PARTIES

const { prisma } = await import("../src/lib/db")
const { getClerkUserIdFromToken, createSubUserSession } = await import("../src/lib/auth")
const { requestClerkUserId } = await import("../src/lib/mobile-clerk-auth")
const { getCurrentUserFromRequest } = await import("../src/app/api/_helpers/auth")
after(() => prisma.$disconnect())

const accounts = await prisma.account.findMany({ where: { clerkUserId: { in: [config.FISCAL_TEST_CLERK_USER_A, config.FISCAL_TEST_CLERK_USER_B] } }, include: { users: { where: { isOwner: true } } } })
assert.equal(accounts.length, 2)
const first = accounts.find(a => a.clerkUserId === config.FISCAL_TEST_CLERK_USER_A)!
const second = accounts.find(a => a.clerkUserId === config.FISCAL_TEST_CLERK_USER_B)!
assert.equal(first.users.length, 1)
assert.equal(second.users.length, 1)
const subuser = await createSubUserSession(first.id, first.users[0].id)
const signed = (sub: string, key = privateKey, expiresIn: number = 60, sid: string | undefined = "fixture-session") => jwt.sign({ sub, ...(sid ? { sid } : {}) }, key, { algorithm: "RS256", expiresIn })
const request = (clerk: string, subuserToken = subuser) => new NextRequest("http://127.0.0.1/api/auth/me", { headers: { "X-Clerk-Authorization": `Bearer ${clerk}`, "X-SubUser-Token": subuserToken } })

test("una identidad firmada y el subusuario de su empresa son aceptados", async () => {
  const token = signed(first.clerkUserId)
  assert.equal(await getClerkUserIdFromToken(`Bearer ${token}`), first.clerkUserId)
  assert.equal(await getClerkUserIdFromToken(token), first.clerkUserId)
  assert.equal(await requestClerkUserId(request(token)), first.clerkUserId)
  assert.equal((await getCurrentUserFromRequest(request(token)))?.id, first.users[0].id)
})
test("una firma falsa, sesión vencida o sin sid nunca autentican", async () => {
  for (const token of [signed(first.clerkUserId, badKey), signed(first.clerkUserId, privateKey, -1), signed(first.clerkUserId, privateKey, 60, "")]) {
    assert.equal(await getClerkUserIdFromToken(`Bearer ${token}`), null)
    assert.equal(await requestClerkUserId(request(token)), null)
    assert.equal(await getCurrentUserFromRequest(request(token)), null)
  }
})
test("un token válido de otra empresa no puede usar la sesión del primer usuario", async () => {
  assert.equal(await getCurrentUserFromRequest(request(signed(second.clerkUserId))), null)
  assert.equal(await getCurrentUserFromRequest(request(signed(first.clerkUserId), "token-inválido")), null)
})
