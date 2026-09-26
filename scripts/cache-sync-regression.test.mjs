// Pruebas aisladas: ejecutan el código real con sesión, red y almacenamiento
// simulados; nunca consultan ni modifican la base de datos de producción.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))

function loadModule(relativePath, mocks, globals = {}) {
  const source = fs.readFileSync(path.join(scriptDirectory, "..", relativePath), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in mocks, `Importación sin mock: ${name}`)
      return mocks[name]
    },
    console: { log() {}, warn() {}, error() {} },
    process: { env: { NODE_ENV: "production" } },
    ...globals,
  }, { filename: relativePath })
  return exports
}

const actionNames = ["syncProductsToIndexedDB", "syncCustomersToIndexedDB", "syncARToIndexedDB"]

for (const reason of ["CLERK_SESSION_MISSING", "SUBUSER_SESSION_EXPIRED", "ACCOUNT_SESSION_MISMATCH"]) {
  test(`Las tres acciones omiten consultas con ${reason}`, async () => {
    const sources = []
    const actions = loadModule("src/app/(app)/sync/actions.ts", {
      "@/lib/auth": {
        async getCurrentUserWithDiagnostics({ source }) {
          sources.push(source)
          return { user: null, reason }
        },
      },
      "@/lib/db": { prisma: new Proxy({}, { get() { assert.fail("Consulta sin sesión") } }) },
    })
    for (const name of actionNames) assert.equal(await actions[name](), null)
    assert.equal(new Set(sources).size, 3)
  })
}

test("Con sesión, una lista vacía es válida y todas las consultas se limitan a la cuenta", async () => {
  const queries = []
  const model = { async findMany(query) { queries.push(query); return [] } }
  const actions = loadModule("src/app/(app)/sync/actions.ts", {
    "@/lib/auth": { async getCurrentUserWithDiagnostics() { return { user: { accountId: "tenant-A" } } } },
    "@/lib/db": { prisma: { product: model, customer: model, accountReceivable: model } },
  })
  for (const name of actionNames) assert.equal((await actions[name]()).length, 0)
  assert.equal(queries[0].where.accountId, "tenant-A")
  assert.equal(queries[1].where.accountId, "tenant-A")
  assert.equal(queries[2].where.sale.accountId, "tenant-A")
})

test("Un error real de base de datos sigue propagándose", async () => {
  const failure = new Error("DB unavailable")
  const actions = loadModule("src/app/(app)/sync/actions.ts", {
    "@/lib/auth": { async getCurrentUserWithDiagnostics() { return { user: { accountId: "tenant-A" } } } },
    "@/lib/db": { prisma: { product: { async findMany() { throw failure } } } },
  })
  await assert.rejects(actions.syncProductsToIndexedDB(), (error) => error === failure)
})

function clientHarness({ online = true, authorized = true, missingIndex = -1, storageError = false } = {}) {
  let calls = 0
  let writes = 0
  let marks = 0
  const listeners = new Map()
  const timers = new Map()
  const cache = {
    async getProductsCache() { return [] },
    async getCustomersCache() { return [] },
    async getARCache() { return [] },
  }
  for (const name of ["saveProductsCache", "saveCustomersCache", "saveARCache"]) {
    cache[name] = async () => { writes++ }
  }
  const actions = Object.fromEntries(actionNames.map((name, index) => [name, async () => {
    calls++
    return index === missingIndex ? null : []
  }]))
  const cacheSync = loadModule("src/lib/auto-sync.ts", {
    "@/app/(app)/sync/actions": actions,
    "./indexed-db": cache,
    "./client-storage": {
      clientStorageKeys: { cacheSync: "sync" }, legacyStorageKey: (key) => key,
      getMigratedLocalStorageItem() { if (storageError) throw new Error("storage denied"); return null },
    },
  }, {
    navigator: { onLine: online },
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name) => listeners.delete(name),
    },
    localStorage: { setItem() { marks++ } },
    fetch: async () => ({ ok: authorized, json: async () => ({ user: authorized ? { id: "A" } : null }) }),
    setTimeout(callback) { timers.set(1, callback); return 1 },
    clearTimeout: (id) => timers.delete(id),
  })
  return { module: cacheSync, listeners, timers, stats: () => ({ calls, writes, marks }) }
}

for (const scenario of [{ online: false }, { authorized: false }, { storageError: true }]) {
  test(`Sin conexión/sesión/almacenamiento, no hay acciones ni borrado: ${JSON.stringify(scenario)}`, async () => {
    const harness = clientHarness(scenario)
    assert.equal(await harness.module.syncCacheData(), false)
    assert.deepEqual(harness.stats(), { calls: 0, writes: 0, marks: 0 })
  })
}

for (let missingIndex = 0; missingIndex < 3; missingIndex++) {
  test(`Si la sesión vence durante la acción ${missingIndex}, se conservan todos los stores`, async () => {
    const harness = clientHarness({ missingIndex })
    assert.equal(await harness.module.syncCacheData(), false)
    assert.deepEqual(harness.stats(), { calls: 3, writes: 0, marks: 0 })
  })
}

test("Dos llamadas simultáneas comparten una carga; las listas vacías se guardan", async () => {
  const harness = clientHarness()
  assert.deepEqual(await Promise.all([harness.module.syncCacheData(), harness.module.syncCacheData()]), [true, true])
  assert.deepEqual(harness.stats(), { calls: 3, writes: 3, marks: 1 })
})

test("El desmontaje cancela el timer y elimina el listener de reconexión", () => {
  const harness = clientHarness()
  const cleanup = harness.module.initAutoSync()
  assert.equal(harness.timers.size, 1)
  assert.equal(harness.listeners.size, 1)
  cleanup()
  assert.equal(harness.timers.size, 0)
  assert.equal(harness.listeners.size, 0)
  assert.deepEqual(harness.stats(), { calls: 0, writes: 0, marks: 0 })
})
