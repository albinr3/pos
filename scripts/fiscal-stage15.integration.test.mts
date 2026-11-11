// Solo fixtures locales; no se crean sesiones ni documentos fiscales reales.
import { test, after } from "node:test"
import assert from "node:assert/strict"
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"
import { PrismaClient } from "@prisma/client"

const url = new URL(process.env.TEST_DATABASE_URL ?? "")
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55439" || !/^\/cash_test_stage15_\d+$/.test(url.pathname)) throw Error("Se requiere una base local aislada de etapa 15")
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
process.env.JWT_SECRET = randomBytes(32).toString("hex")
process.env.CLERK_SECRET_KEY = "sk_test_fixture"
process.env.CLERK_JWT_KEY = keys.publicKey.export({ type: "spki", format: "pem" }).toString()
delete process.env.CLERK_AUTHORIZED_PARTIES
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const auth = await import("../src/lib/auth")
const { requestAccountDeletion, processAccountDeletion } = await import("../src/lib/account-deletion")
const { purgeAccountData } = await import("../src/lib/account-purge")
const { cashRequest } = await import("../src/lib/cash-context")
const { fiscalDominicanDay, addFiscalDays, fiscalDateIsFuture } = await import("../src/lib/fiscal/core/date")
const { getE43Template } = await import("../src/lib/fiscal/core/expense-document")
const { listFiscalDocuments } = await import("../src/lib/fiscal/core/preparation")
const { reserveFiscalNumber } = await import("../src/lib/fiscal/core/sequences")
const { hasFiscalHistory } = await import("../src/lib/fiscal/core/retention")
const historyRoute = await import("../src/app/api/fiscal/history/export/route")
const fiscalSettingsRoute = await import("../src/app/api/fiscal/settings/route")
after(async () => { await db.$disconnect(); const { prisma } = await import("../src/lib/db"); await prisma.$disconnect() })
const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, { headers })
async function headers(account: { id: string; clerkUserId: string }, user: { id: string }) {
  return { "x-clerk-authorization": `Bearer ${jwt.sign({ sub: account.clerkUserId, sid: "fixture-session" }, keys.privateKey, { algorithm: "RS256", expiresIn: 120 })}`, "x-subuser-token": await auth.createSubUserSession(account.id, user.id) }
}

test("migración, exportación móvil y protección de baja con historial apagado", async () => {
  const legacy = await db.account.findUniqueOrThrow({ where: { id: "stage15-legacy" } })
  assert.equal(await db.sale.count({ where: { accountId: legacy.id } }), 1)
  assert.equal(await db.fiscalSettings.count({ where: { accountId: legacy.id } }), 0)
  assert.equal(await db.fiscalDocument.count({ where: { accountId: legacy.id } }), 0)

  const suffix = randomUUID(), pin = "4321"
  const account = await db.account.create({ data: { name: "Empresa fiscal", clerkUserId: `stage15-${suffix}` } })
  const other = await db.account.create({ data: { name: "Empresa ordinaria", clerkUserId: `stage15-other-${suffix}` } })
  const owner = await db.user.create({ data: { accountId: account.id, name: "Dueña", username: "owner", isOwner: true, passwordHash: await bcrypt.hash(pin, 4) } })
  const cashier = await db.user.create({ data: { accountId: account.id, name: "Cajero", username: "cashier", passwordHash: "fixture" } })
  const outsider = await db.user.create({ data: { accountId: other.id, name: "Otro", username: "owner", isOwner: true, passwordHash: "fixture" } })
  await db.fiscalSettings.create({ data: { accountId: account.id, enabled: true, jurisdiction: "DO", regime: "DO_ECF", environment: "TEST", configurationStatus: "VALIDATED", version: 1, legalName: "Empresa fiscal", taxId: "123456789" } })
  await db.fiscalPolicyChange.create({ data: { accountId: account.id, version: 1, actorUserId: owner.id, policy: { enabled: true } } })
  const sale = await db.sale.create({ data: { accountId: account.id, userId: owner.id, invoiceNumber: 1, invoiceCode: `TEST-${suffix}`, type: "CONTADO", subtotalCents: 100, itbisCents: 0, totalCents: 100 } })
  const doc = await db.fiscalDocument.create({ data: { accountId: account.id, saleId: sale.id, type: "E32", policyVersion: 1, ruleVersion: "fixture", snapshot: { issueDate: "2026-11-10" }, createdAt: new Date("2026-11-11T02:30:00Z") } })
  await db.fiscalSequence.create({ data: { accountId: account.id, type: "E32", rangeStart: BigInt(1), rangeEnd: BigInt(100), lastNumber: BigInt(0), active: true } })
  await db.fiscalDocument.update({ where: { id: doc.id }, data: { state: "VALIDADO" } })
  await db.$transaction(tx => reserveFiscalNumber(tx, owner, doc.id, "E32"))
  const expense = await db.operatingExpense.create({ data: { accountId: account.id, userId: owner.id, description: "Gasto", amountCents: 100, expenseDate: new Date("2026-11-11T02:30:00Z"), fiscalExpenseDetails: { eligibleMinorExpense: true, employee: { name: "Empleado" }, lines: [{ description: "Taxi", kind: "SERVICIO", amountCents: 100, taxTreatment: "EXENTO" }] } } })
  assert.equal((await getE43Template(owner, expense.id)).issueDate, "2026-11-10")
  assert.equal((await listFiscalDocuments(owner, new URLSearchParams("from=2026-11-10&to=2026-11-10"))).data.length, 1)
  assert.equal((await listFiscalDocuments(owner, new URLSearchParams("from=2026-11-11&to=2026-11-11"))).data.length, 0)
  await assert.rejects(listFiscalDocuments(owner, new URLSearchParams("from=2026-02-31")))
  await db.fiscalSettings.update({ where: { accountId: account.id }, data: { enabled: false } })

  const ownerHeaders = await headers(account, owner), otherHeaders = await headers(other, outsider), limitedHeaders = await headers(account, cashier)
  assert.equal((await historyRoute.GET(request("/api/fiscal/history/export"))).status, 401)
  assert.equal((await historyRoute.GET(request("/api/fiscal/history/export", limitedHeaders))).status, 403)
  const response = await historyRoute.GET(request("/api/fiscal/history/export", ownerHeaders))
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control") ?? "", /no-store/)
  const exported = await response.json()
  assert.equal(exported.accountId, account.id); assert.equal(exported.allocations[0].number, "1")
  assert.equal(exported.sequences[0].rangeEnd, "100"); assert.equal(exported.documents[0].id, doc.id)
  assert.equal(exported.sources.sales[0].id, sale.id)
  const otherResponse = await historyRoute.GET(request("/api/fiscal/history/export", otherHeaders))
  assert.equal(otherResponse.status, 200); assert.equal((await otherResponse.json()).documents.length, 0)
  assert.equal((await fiscalSettingsRoute.GET(request("/api/fiscal/settings", limitedHeaders))).status, 403)

  const blocked = await requestAccountDeletion({ clerkUserId: account.clerkUserId, accountId: account.id, userId: owner.id, pin })
  assert.equal(blocked.success, false)
  if (blocked.success) throw Error("La baja fiscal no debe aceptarse")
  assert.equal(blocked.code, "FISCAL_RETENTION_REQUIRED")
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).isActive, true)
  await assert.rejects(db.$executeRaw`DELETE FROM "Account" WHERE id=${account.id}`, /FISCAL_RETENTION_REQUIRED/)
  const job = await db.accountDeletion.create({ data: { accountId: account.id, clerkUserHash: `stage15-${suffix}`, clerkUserId: account.clerkUserId, lemonSubscriptionId: "fixture" } })
  let calls = 0
  assert.equal(await processAccountDeletion(job.id, { cancelSubscription: async () => { calls++ }, deleteIdentity: async () => { calls++ }, deleteFiles: async () => { calls++ } }), false)
  assert.equal(calls, 0); assert.equal((await db.accountDeletion.findUniqueOrThrow({ where: { id: job.id } })).lastError, "FISCAL_RETENTION_REQUIRED")
  await assert.rejects(cashRequest.run({ maintenance: true }, () => db.$transaction(tx => purgeAccountData(tx, account.id))), /FISCAL_RETENTION_REQUIRED/)

  await cashRequest.run({ maintenance: true }, () => db.$transaction(tx => purgeAccountData(tx, other.id)))
  assert.equal(await db.account.findUnique({ where: { id: other.id } }), null)
})

test("días fiscales y vencimientos no dependen de la zona del servidor", () => {
  const previous = process.env.TZ
  try {
    for (const zone of ["UTC", "America/New_York", "Asia/Tokyo"]) {
      process.env.TZ = zone
      assert.equal(fiscalDominicanDay(new Date("2026-11-11T02:30:00Z")), "2026-11-10")
      assert.equal(fiscalDominicanDay(addFiscalDays(new Date("2026-03-08T06:30:00Z"), 1)), "2026-03-09")
      assert.equal(fiscalDateIsFuture(new Date("2026-11-12T05:00:00Z"), new Date("2026-11-11T12:00:00Z")), true)
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})

test("los intentos fiscales sin documento bloquean la baja en servicio y base", async () => {
  for (const kind of ["preparation", "adjustment"] as const) {
    const suffix = randomUUID()
    const account = await db.account.create({ data: { name: "Intento fiscal", clerkUserId: `stage15-attempt-${suffix}` } })
    // Un intento aislado también es historial y no debe quedar fuera del guard de baja.
    if (kind === "preparation") await db.fiscalPreparationOperation.create({ data: { id: randomUUID(), accountId: account.id, operationId: suffix, actorUserId: "fixture", kind: "PREPARE", payloadHash: "fixture", status: "FAILED" } })
    else await db.fiscalAdjustmentOperation.create({ data: { accountId: account.id, operationId: suffix, actorUserId: "fixture", kind: "CREATE", payloadHash: "fixture", result: {} } })
    assert.equal(await hasFiscalHistory(db, account.id), true)
    await assert.rejects(db.$executeRaw`DELETE FROM "Account" WHERE id=${account.id}`, /FISCAL_RETENTION_REQUIRED/)
  }
})
