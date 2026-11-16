import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const source = fs.readFileSync(new URL("../src/app/(app)/sales/pos-client.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n")
const start = source.indexOf('  useEffect(() => {\n    if (!fiscalSale?.canPrepare) return\n    const changedCustomer')
const end = source.indexOf('\n\n  const lookupFiscalBuyer', start)
assert.ok(start >= 0 && end > start)
const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
function fixture() {
  const state = { identification: "", name: "", type: "", message: "" }
  const ctx = { useEffect: callback => callback(), fiscalSale: { canPrepare: true }, effectiveCustomerId: "client", selectedCustomer: { isGeneric: false }, fiscalContext: { customers: [{ id: "client", preferredReceiptType: "E31", identification: "131-523226", identificationCountry: "DO", legalName: "EMPRESA" }] },
    initializedFiscalCustomer: { current: undefined }, fiscalBuyerDirty: { current: false }, preserveFiscalBuyerOnSelection: { current: false }, warnedConsumerRnc: { current: "" }, fiscalLookupSequence: { current: 0 }, fiscalLookupPending: { current: "" }, fiscalLookupLatest: { current: {} },
    setFiscalType: value => { state.type = value }, setFiscalIdentification: value => { state.identification = value }, setFiscalBuyerName: value => { state.name = value }, setFiscalLookupMessage: value => { state.message = value }, setFiscalMatches() {}, setShowConsumerRncWarning() {} }
  return { state, ctx, run: () => vm.runInNewContext(compiled, ctx) }
}
test("Seleccionar un cliente carga su identificación, razón social y comprobante preferido", () => {
  const f = fixture(); f.run(); assert.equal(f.state.identification, "131-523226"); assert.equal(f.state.name, "EMPRESA"); assert.equal(f.state.type, "E31")
})
test("Una actualización tardía no reemplaza lo que se editó y cambiar de cliente limpia los datos", () => {
  const f = fixture(); f.run(); f.ctx.fiscalBuyerDirty.current = true; f.state.name = "Edición manual"; f.ctx.fiscalContext.customers[0].legalName = "Otra respuesta"; f.run(); assert.equal(f.state.name, "Edición manual")
  f.ctx.effectiveCustomerId = "generic"; f.ctx.selectedCustomer = { isGeneric: true }; f.run(); assert.equal(f.state.name, ""); assert.equal(f.state.identification, ""); assert.equal(f.state.type, "E32")
})
test("La selección por búsqueda conserva lo escrito y la identificación extranjera no se presenta como dominicana", () => {
  const f = fixture(); f.ctx.preserveFiscalBuyerOnSelection.current = true; f.state.name = "Consultada"; f.state.type = "E31"; f.run(); assert.equal(f.state.name, "Consultada"); assert.equal(f.state.type, "E31")
  const g = fixture(); g.ctx.fiscalContext.customers[0].identificationCountry = "US"; g.run(); assert.equal(g.state.identification, ""); assert.match(g.state.message, /extranjera/)
})
const coreSource = fs.readFileSync(new URL("../src/lib/fiscal/core/sale-customer.ts", import.meta.url), "utf8")
const coreCompiled = ts.transpileModule(coreSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
test("El contexto fiscal entrega solo datos del cliente de la cuenta y conserva ceros", async () => {
  const exports = {}; let query
  const mocks = { "@/lib/db": { prisma: {} }, "@/lib/permissions": { hasPermission: () => true }, "./document": { FiscalDocumentError: class extends Error {} }, "./master-data": { parsePreferredReceiptTypes: value => value ? [value] : [] }, "./policy": { resolveFiscalPolicy: async () => ({ enabled: true, jurisdiction: "DO", regime: "DO_ECF", environment: "TEST", configurationStatus: "VALIDATED", version: 1 }) } }
  vm.runInNewContext(coreCompiled, { exports, require: name => { if (!(name in mocks)) throw Error(name); return mocks[name] } })
  const rows = [
    { id: "1", name: "Comercial", isGeneric: false, fiscalPreferredReceiptType: "E31", fiscalIdentification: "00112345678", fiscalIdentificationCountry: "DO", fiscalLegalName: "RAZON SOCIAL", cedula: null },
    { id: "2", name: "Persona", isGeneric: false, fiscalPreferredReceiptType: null, fiscalIdentification: null, fiscalIdentificationCountry: null, fiscalLegalName: null, cedula: "001-1234567-8" },
    { id: "3", name: "General", isGeneric: true, fiscalPreferredReceiptType: "E31", fiscalIdentification: "123456789", fiscalIdentificationCountry: "DO", fiscalLegalName: "No usar", cedula: null },
  ]
  const result = await exports.listFiscalSaleCustomers({ id: "user", accountId: "empresa" }, { customer: { findMany: async options => { query = options; return rows } } })
  assert.equal(query.where.accountId, "empresa"); assert.equal(query.where.isActive, true)
  assert.equal(result.customers[0].identification, "00112345678"); assert.equal(result.customers[0].legalName, "RAZON SOCIAL"); assert.equal(result.customers[0].preferredReceiptType, "E31")
  assert.equal(result.customers[1].identification, "001-1234567-8"); assert.equal(result.customers[1].legalName, "Persona"); assert.equal(result.customers[2].identification, null)
})
