// Reloj y conexión simulados: reproduce P2028 sin consultar datos reales ni esperar cinco segundos.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
const actor = { id: "employee", accountId: "business", name: "Ana", isOwner: true }
const input = { name: "Banco de prueba", type: "BANCO", openingBalanceCents: 10000 }

function harness({ authMs = 5032, firstLockMs = 0, failOpening = false, authError } = {}) {
  const state = { now: 0, active: false, transactions: 0, authCalls: 0, authInsideTransaction: false, committed: [], revalidated: [] }
  const cache = new Map()
  let engine
  const client = {
    async $transaction(callback, options = {}) {
      state.transactions++
      state.options = options
      state.active = true
      const startedAt = state.now
      const pending = []
      let locks = 0
      function query(delay = 10) {
        state.now += delay
        if (state.now - startedAt > (options.timeout ?? 5000)) {
          throw Object.assign(new Error("Transaction already closed: expired transaction"), { code: "P2028" })
        }
      }
      const tx = {
        async $queryRaw() { query(locks++ === 0 ? firstLockMs : 10); return [{ id: actor.accountId }] },
        cashControl: { async findUnique() { query(); return null } },
        treasuryAccount: { async create({ data }) { query(); const row = { id: "new-bank", ...data }; pending.push({ model: "account", row }); return row } },
        treasuryOpeningBalance: { async create({ data }) {
          query()
          if (failOpening) throw new Error("No se pudo guardar el saldo")
          const row = { id: "opening", ...data }
          pending.push({ model: "opening", row })
          return row
        } },
      }
      try {
        const result = await callback(tx)
        query(0)
        state.committed.push(...pending)
        return result
      } finally { state.active = false }
    },
  }
  const mocks = {
    "next/headers": { headers: async () => new Headers(), cookies: async () => ({ get: () => ({ value: "device-cookie" }) }) },
    "next/server": { NextRequest: class {} },
    "@/app/api/_helpers/auth": { async getCurrentUserFromRequest() {
      state.authCalls++
      state.authInsideTransaction ||= state.active
      state.now += authMs
      if (authError) throw authError
      return actor
    } },
    "next/cache": { revalidatePath: value => state.revalidated.push(value) },
    "@prisma/client": require("@prisma/client"),
    "@/lib/auth": { getCurrentUser: async () => actor },
    "@/lib/db": { prisma: {
      treasuryAccount: { findFirst: async () => null },
      $transaction: (...args) => engine.runCashTransaction(client, ...args),
    } },
    "@/lib/permission-guard": { ensurePermission: async () => {} },
    "@/lib/audit-log": {}, "@/lib/cash-treasury": {}, "@/lib/dates": {}, "@/lib/treasury": {},
  }
  function load(name) {
    if (name in mocks) return mocks[name]
    if (name.startsWith("node:")) return require(name)
    if (cache.has(name)) return cache.get(name)
    assert.ok(["@/lib/cash-context", "@/lib/cash-financial-db", "@/lib/cash-money", "@/lib/permissions", "@/app/(app)/treasury/actions"].includes(name), `Importación no autorizada: ${name}`)
    const source = fs.readFileSync(new URL(`../src/${name.slice(2)}.ts`, import.meta.url), "utf8")
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const exports = {}
    cache.set(name, exports)
    vm.runInNewContext(compiled, { exports, require: load, Headers, console }, { filename: name })
    return exports
  }
  engine = load("@/lib/cash-financial-db")
  return { state, client, engine, context: load("@/lib/cash-context"), actions: load("@/app/(app)/treasury/actions") }
}

test("Una sesión que tarda más de 5 s no consume el plazo de la transacción", async () => {
  const f = harness()
  await f.engine.runCashTransaction(f.client, async tx => {
    const account = await tx.treasuryAccount.create({ data: { accountId: actor.accountId, name: input.name } })
    await tx.treasuryOpeningBalance.create({ data: { accountId: actor.accountId, treasuryAccountId: account.id, amountCents: 10000 } })
  })
  assert.equal(f.state.authInsideTransaction, false)
  assert.equal(f.state.authCalls, 1)
  assert.equal(f.state.committed.length, 2)
})

test("Crear cuenta tolera una espera de bloqueo mayor a 5 s y guarda su saldo", async () => {
  const f = harness({ firstLockMs: 6000 })
  await f.actions.createTreasuryAccount(input)
  assert.equal(f.state.options.timeout, 15000)
  assert.equal(f.state.options.maxWait, 5000)
  assert.equal(f.state.authInsideTransaction, false)
  const [account, opening] = f.state.committed
  assert.equal(account.row.type, "BANCO")
  assert.equal(opening.row.treasuryAccountId, account.row.id)
  assert.equal(opening.row.amountCents, input.openingBalanceCents)
  assert.deepEqual(f.state.revalidated, ["/treasury"])
})

test("Un error al guardar el saldo revierte también la cuenta", async () => {
  const f = harness({ failOpening: true })
  await assert.rejects(f.actions.createTreasuryAccount(input), /No se pudo guardar el saldo/)
  assert.equal(f.state.transactions, 1)
  assert.equal(f.state.committed.length, 0)
  assert.equal(f.state.revalidated.length, 0)
})

test("Una operación de caja sin identidad válida falla antes de reservar la transacción", async () => {
  const error = new Error("Sesión inválida")
  const f = harness({ authError: error })
  await assert.rejects(f.context.cashRequest.run({ operation: { clientOperationId: "operation" } }, () => f.engine.runCashTransaction(f.client, async () => assert.fail("No debe ejecutar el callback"))), error)
  assert.equal(f.state.transactions, 0)
})

test("Una transacción anidada reutiliza la conexión y la identidad ya verificadas", async () => {
  const f = harness()
  await f.engine.runCashTransaction(f.client, async outer => f.engine.runCashTransaction(f.client, async inner => {
    assert.equal(f.context.cashRequest.getStore().trustedActor.id, actor.id)
    assert.equal(f.context.cashRequest.getStore().deviceHash, f.context.cashHash("device-cookie"))
    const account = await outer.treasuryAccount.create({ data: { accountId: actor.accountId } })
    await inner.treasuryOpeningBalance.create({ data: { accountId: actor.accountId, treasuryAccountId: account.id } })
  }))
  assert.equal(f.state.transactions, 1)
  assert.equal(f.state.authCalls, 1)
  assert.equal(f.state.committed.length, 2)
})
