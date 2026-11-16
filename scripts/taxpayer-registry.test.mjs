import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const source = fs.readFileSync(new URL("../src/app/api/fiscal/taxpayer/route.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
class FiscalError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status } }
function fixture({ user = { accountId: "A", canManageCustomers: true }, policy = { enabled: true, jurisdiction: "DO", regime: "DO_ECF" }, imported = true, name = "EMPRESA" } = {}) {
  let reads = 0
  const exports = {}
  const mocks = {
    "@/lib/db": { prisma: { $queryRaw: async () => { reads++; return reads === 1 ? (imported ? [{ recordCount: 1 }] : []) : (name ? [{ legalName: name }] : []) } } },
    "@/lib/permissions": { hasPermission: (u, key) => Boolean(u[key]) },
    "@/lib/fiscal/core/policy": { resolveFiscalPolicy: async () => policy },
    "@/lib/fiscal/core/sale-customer": { normalizeDominicanBuyerId: value => { if (typeof value !== "string" || !/^[\d\s-]+$/.test(value) || !/^(?:\d{9}|\d{11})$/.test(value.replace(/[\s-]/g, ""))) throw new FiscalError("INVALID_INPUT", "Inválido", 400); return value.replace(/[\s-]/g, "") } },
    "@/lib/fiscal/core/document": { FiscalDocumentError: FiscalError },
    "../documents/_shared": { actor: async () => { if (!user) throw new FiscalError("UNAUTHENTICATED", "No autenticado", 401); return user }, ok: value => ({ status: 200, value }), errorResponse: error => ({ status: error.status, code: error.code }) },
  }
  vm.runInNewContext(compiled, { exports, require: name => { if (!(name in mocks)) throw Error(`Dependencia inesperada: ${name}`); return mocks[name] } })
  return { get: id => exports.GET({ nextUrl: new URL(`http://localhost/?${id}`) }), reads: () => reads }
}
test("Devuelve coincidencia normalizada y ausencia sin modificar datos", async () => {
  const found = fixture(); const result = await found.get("identification=001-1234567-8")
  assert.equal(result.status, 200); assert.equal(result.value.identification, "00112345678"); assert.equal(result.value.legalName, "EMPRESA")
  const missing = fixture({ name: null }); assert.equal((await missing.get("identification=123456789")).value.legalName, null)
})
test("Rechaza sesión, permisos, módulo apagado e identificaciones inválidas antes de leer el padrón", async () => {
  for (const [options, query, status] of [[{ user: null }, "identification=123456789", 401], [{ user: { accountId: "A" } }, "identification=123456789", 403], [{ policy: { enabled: false } }, "identification=123456789", 409], [{}, "identification=12A3456789", 400], [{}, "identification=123456789&identification=123456789", 400]]) {
    const f = fixture(options); assert.equal((await f.get(query)).status, status); assert.equal(f.reads(), 0)
  }
})
test("Informa padrón no importado y permite a ventas con ambos permisos", async () => {
  assert.equal((await fixture({ imported: false }).get("identification=123456789")).status, 503)
  assert.equal((await fixture({ user: { accountId: "A", canAccessSales: true, canPrepareFiscalDocuments: true } }).get("identification=123456789")).status, 200)
})
