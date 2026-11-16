import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

// Ejecutar la búsqueda real del POS con respuestas controladas, sin iniciar sesión ni guardar ventas.
const source = fs.readFileSync(new URL("../src/app/(app)/sales/pos-client.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n")
const start = source.indexOf("  const lookupFiscalBuyer = useCallback(async () => {")
const end = source.indexOf("\n\n  const selectedCustomerLabel", start)
assert.ok(start >= 0 && end > start)
const compiled = ts.transpileModule(`${source.slice(start, end)}\nresult.lookup = lookupFiscalBuyer`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
function fixture(identification, { matches = [], legalName = null, fiscalType = "E31" } = {}) {
  const state = { message: "", tone: "", requests: 0, warnings: 0 }
  const result = {}
  const context = { result, navigator: { onLine: true }, effectiveCustomerId: "general", fiscalType, useCallback: fn => fn,
    fiscalLookupLatest: { current: { identification, name: "" } }, fiscalLookupSequence: { current: 0 }, fiscalLookupPending: { current: "" }, preserveFiscalBuyerOnSelection: { current: false }, warnedConsumerRnc: { current: "" }, setShowConsumerRncWarning: visible => { if (visible) state.warnings++ },
    setFiscalLookupMessage: (message, tone = "error") => { state.message = message; state.tone = tone }, setFiscalMatches() {}, setFiscalBuyerName() {}, setCustomerId() {},
    fetch: async url => { state.requests++; return { ok: true, json: async () => url.includes("/sales/customer?") ? { matches, hasMore: false } : { legalName } } },
  }
  vm.runInNewContext(compiled, context)
  return { state, lookup: result.lookup }
}
test("Identificaciones incompletas y con letras muestran error sin consultar", async () => {
  for (const id of ["12345678", "123456789012", "123A56789"]) {
    const f = fixture(id); await f.lookup(); assert.match(f.state.message, /RNC de 9 dígitos/); assert.equal(f.state.tone, "error"); assert.equal(f.state.requests, 0)
  }
})
test("Campo vacío no muestra error ni consulta", async () => {
  const f = fixture(""); await f.lookup(); assert.equal(f.state.message, ""); assert.equal(f.state.requests, 0)
})
test("Un RNC sin coincidencia se informa, incluso si hay una ficha de cliente", async () => {
  for (const matches of [[], [{ id: "cliente", name: "Cliente" }]]) {
    const f = fixture("131523226", { matches }); await f.lookup(); assert.match(f.state.message, /no (?:se encontró|aparece)/i); assert.equal(f.state.tone, "error"); assert.equal(f.state.requests, 2)
  }
})
test("Una identificación encontrada muestra éxito", async () => {
  const f = fixture("131-523226", { legalName: "EMPRESA" }); await f.lookup(); assert.match(f.state.message, /encontrada/); assert.equal(f.state.tone, "success")
})

test("Consumidor final sin resultado indica cómo continuar sin pedir nombre", async () => {
  const f = fixture("131523226", { fiscalType: "E32" }); await f.lookup(); assert.match(f.state.message, /corrígela o déjala vacía/); assert.doesNotMatch(f.state.message, /escribe la razón social/)
})

test("El RNC en consumidor final abre la advertencia una sola vez", async () => {
  const f = fixture("131-523226", { fiscalType: "E32", legalName: "EMPRESA" }); await f.lookup(); await f.lookup(); assert.equal(f.state.warnings, 1)
})
test("No se advierte para cédula ni para crédito fiscal", async () => {
  for (const [id, type] of [["00112345678", "E32"], ["131523226", "E31"]]) { const f = fixture(id, { fiscalType: type, legalName: "EMPRESA" }); await f.lookup(); assert.equal(f.state.warnings, 0) }
})
