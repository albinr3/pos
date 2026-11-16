import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const source = fs.readFileSync(new URL("../src/components/app/fiscal-master-fields.tsx", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
function fixture({ country = "DO", profile = true, legalName = "EMPRESA", hideCustomerFiscalContact = false } = {}) {
  let customerName = "Anterior"
  let values = { fiscalIdentificationCountry: country, fiscalIdentification: "101234567", fiscalLegalName: "Anterior" }
  let hooks = [], cursor = 0, requests = 0
  const jsx = (type, props) => ({ type, props: props || {} })
  const mocks = {
    "react": { useRef: value => { const index = cursor++; return hooks[index] ||= { current: value } }, useState: initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value }] } },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@/lib/fiscal/core/countries": { FISCAL_COUNTRIES: [] },
    "@/components/ui/dropdown-menu": {}, "lucide-react": {},
    "@/components/ui/input": { Input: "input" }, "@/components/ui/label": { Label: "label" },
    "@/lib/fiscal/core/master-data": { customerFiscalFields: ["fiscalIdentificationCountry", "fiscalIdentification", "fiscalLegalName", "fiscalEmail", "fiscalAddress"], supplierFiscalFields: [], productFiscalFields: [], FISCAL_MASTER_CATALOG: { identificationTypes: [], declaredConditions: [], itemTypes: [], taxTreatments: [] } },
  }
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: name => { if (!(name in mocks)) throw Error(name); return mocks[name] }, fetch: async () => { requests++; return { ok: true, json: async () => ({ legalName }) } } })
  function render() { cursor = 0; return exports.FiscalMasterFields({ kind: "customer", value: values, onChange: next => { values = next }, doProfile: profile, hideCustomerFiscalContact, onLookupStart: () => name => { customerName = name } }) }
  function find(node, predicate) {
    if (Array.isArray(node)) { for (const item of node) { const result = find(item, predicate); if (result) return result } return }
    if (!node || typeof node !== "object") return
    if (predicate(node)) return node
    return find(node.props?.children, predicate)
  }
  return { hasField: (tree, id) => Boolean(find(tree, n => n.type === "input" && n.props?.id === `fiscal-${id}`)), input: tree => find(tree, n => n.props?.id === "fiscal-fiscalIdentification" && n.type === "input"), status: tree => find(tree, n => n.props?.role === "status")?.props.children, statusClass: tree => find(tree, n => n.props?.role === "status")?.props.className, render, values: () => values, customerName: () => customerName, requests: () => requests }
}
test("Consultar al perder foco completa razón social y conserva el resto de campos", async () => {
  const f = fixture(); f.input(f.render()).props.onBlur(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.values().fiscalLegalName, "EMPRESA"); assert.equal(f.customerName(), "EMPRESA"); assert.equal(f.values().fiscalIdentification, "101234567"); assert.equal(f.requests(), 1); assert.match(f.statusClass(f.render()), /text-green-700/)
})
test("Sin país dominicano indica la causa y no consulta", async () => {
  const f = fixture({ country: null }); f.input(f.render()).props.onKeyDown({ key: "Enter", preventDefault() {} }); await new Promise(resolve => setImmediate(resolve))
  assert.match(f.status(f.render()), /Selecciona República Dominicana/); assert.match(f.statusClass(f.render()), /text-red-700/); assert.equal(f.requests(), 0)
})

test("El valor pegado se consulta al pulsar Enter antes del siguiente render", async () => {
  const f = fixture(); const input = f.input(f.render())
  // El navegador inserta el portapapeles y React entrega el valor mediante onChange.
  input.props.onChange({ target: { value: "131-523226" } })
  let prevented = false
  input.props.onKeyDown({ key: "Enter", preventDefault() { prevented = true } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(prevented, true); assert.equal(f.values().fiscalIdentification, "131-523226"); assert.equal(f.values().fiscalLegalName, "EMPRESA"); assert.equal(f.requests(), 1)
})

test("Sin coincidencia conserva el nombre del cliente", async () => {
  const f = fixture({ legalName: null }); f.input(f.render()).props.onBlur(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.customerName(), "Anterior"); assert.equal(f.values().fiscalLegalName, "Anterior")
})

test("Los datos fiscales de contacto se ocultan solo cuando se solicita", () => {
  const creation = fixture({ hideCustomerFiscalContact: true }); const createTree = creation.render()
  assert.equal(creation.hasField(createTree, "fiscalEmail"), false); assert.equal(creation.hasField(createTree, "fiscalAddress"), false); assert.equal(creation.hasField(createTree, "fiscalLegalName"), true)
  const edit = fixture(); const editTree = edit.render(); assert.equal(edit.hasField(editTree, "fiscalEmail"), true); assert.equal(edit.hasField(editTree, "fiscalAddress"), true)
})
