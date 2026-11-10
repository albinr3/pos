import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FISCAL_COUNTRIES } from '../src/lib/fiscal/core/countries.ts'
import * as master from '../src/lib/fiscal/core/master-data.ts'
const require = createRequire(import.meta.url)
const source = fs.readFileSync(new URL('../src/components/app/fiscal-master-fields.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const exports = {}
vm.runInNewContext(compiled, { exports, require(name) {
  if (name === 'react/jsx-runtime') return require(name)
  if (name === '@/lib/fiscal/core/countries') return { FISCAL_COUNTRIES }
  if (name === '@/lib/fiscal/core/master-data') return master
  if (name === '@/components/ui/input') return { Input: props => React.createElement('input', props) }
  if (name === '@/components/ui/label') return { Label: props => React.createElement('label', props) }
  if (name === 'lucide-react') return { ChevronDown: () => null }
  if (name === '@/components/ui/dropdown-menu') return {
    DropdownMenu: ({ children }) => React.createElement('div', null, children),
    DropdownMenuTrigger: ({ children }) => children,
    DropdownMenuContent: ({ children }) => React.createElement('div', null, children),
    DropdownMenuCheckboxItem: ({ children, checked }) => React.createElement('div', { role: 'menuitemcheckbox', 'aria-checked': checked }, children),
  }
  throw Error(`Dependencia inesperada: ${name}`)
} })
const render = (kind, country) => renderToStaticMarkup(React.createElement(exports.FiscalMasterFields, { kind, value: { fiscalIdentificationCountry: country }, onChange() {} }))
for (const kind of ['customer', 'supplier']) test(`${kind}: ofrece países y muestra el país configurado`, () => {
  const html = render(kind, 'DO')
  assert.match(html, /<option value="DO" selected="">República Dominicana<\/option>/)
  assert.match(html, /<option value="US">Estados Unidos<\/option>/)
  assert.match(html, /<option value="">Sin especificar<\/option>/)
})
test('Un valor histórico libre permanece seleccionado', () => {
  assert.match(render('customer', 'País histórico'), /<option value="País histórico" selected="">País histórico<\/option>/)
})
test('El listado contiene códigos únicos y más de 190 países y territorios', () => {
  assert.ok(FISCAL_COUNTRIES.length > 190)
  assert.equal(new Set(FISCAL_COUNTRIES.map(country => country.code)).size, FISCAL_COUNTRIES.length)
})

for (const entity of ['customers', 'suppliers']) test(`${entity}: obtiene la jurisdicción solo de la empresa autenticada`, async () => {
  const filename = new URL(`../src/app/(app)/${entity}/page.tsx`, import.meta.url)
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const pageExports = {}
  let queriedAccount
  vm.runInNewContext(js, { exports: pageExports, require(name) {
    if (name === 'react/jsx-runtime') return require(name)
    if (name === '@/lib/db') return { prisma: { fiscalSettings: { findUnique: async ({ where }) => { queriedAccount = where.accountId; return { jurisdiction: 'DO' } } } } }
    if (name === '@/lib/auth') return { getCurrentUser: async () => ({ accountId: 'empresa-prueba' }) }
    if (name === '@/lib/permissions') return { hasPermission: () => true }
    if (name === 'next/navigation') return { redirect: () => { throw Error('No autorizado') } }
    if (name.endsWith('-client')) return { [entity === 'customers' ? 'CustomersClient' : 'SuppliersClient']: ({ defaultFiscalCountry }) => React.createElement('p', null, defaultFiscalCountry) }
    throw Error(`Dependencia inesperada: ${name}`)
  } })
  const page = await pageExports.default({ searchParams: Promise.resolve({}) })
  assert.equal(queriedAccount, 'empresa-prueba')
  assert.match(renderToStaticMarkup(page), /<p>DO<\/p>/)
})

test('El selector permite varios comprobantes y conserva una preferencia histórica', () => {
  const selected = master.encodePreferredReceiptTypes(['E31', 'E32'])
  const html = renderToStaticMarkup(React.createElement(exports.FiscalMasterFields, { kind: 'customer', value: { fiscalPreferredReceiptType: selected }, onChange() {} }))
  assert.match(html, /aria-checked="true">E31/)
  assert.match(html, /aria-checked="true">E32/)
  assert.deepEqual(master.parsePreferredReceiptTypes('E44'), ['E44'])
  assert.deepEqual(master.preferredReceiptResponse(selected), { fiscalPreferredReceiptType: 'E31', fiscalPreferredReceiptTypes: ['E31', 'E32'] })
  assert.equal(master.encodePreferredReceiptTypes([]), null)
})

test('Las actualizaciones de apps antiguas conservan o reemplazan la selección según su intención', () => {
  const existing = master.encodePreferredReceiptTypes(['E31', 'E32'])
  assert.equal(master.preserveLegacyPreferredReceipts('E31', existing, true), undefined)
  assert.equal(master.preserveLegacyPreferredReceipts('E44', existing, true), 'E44')
  assert.equal(master.preserveLegacyPreferredReceipts(null, existing, true), null)
  assert.equal(master.preserveLegacyPreferredReceipts('E31', existing, false), 'E31')
  assert.deepEqual(master.preferredReceiptInput({ fiscalPreferredReceiptTypes: ['E31', 'E32'] }), { fiscalPreferredReceiptType: existing })
})


test('Proveedor: razón social primero y residencia fiscal con países y valor anterior', () => {
  const html = renderToStaticMarkup(React.createElement(exports.FiscalMasterFields, { kind: 'supplier', value: { fiscalResidence: 'DO' }, onChange() {} }))
  assert.ok(html.indexOf('Razón social') < html.indexOf('Tipo de identificación'))
  assert.match(html, /<select id="fiscal-fiscalResidence"[^>]*>[\s\S]*?<option value="DO" selected="">República Dominicana<\/option>/)
  const previous = renderToStaticMarkup(React.createElement(exports.FiscalMasterFields, { kind: 'supplier', value: { fiscalResidence: 'Valor anterior' }, onChange() {} }))
  assert.match(previous, /<option value="Valor anterior" selected="">Valor anterior<\/option>/)
})
test('los formularios ofrecen los mismos códigos que el catálogo y filtran comprobantes por perfil', () => {
  const configured = renderToStaticMarkup(React.createElement(exports.FiscalMasterFields, { kind: 'customer', value: {}, onChange() {}, doProfile: true }))
  const ordinary = renderToStaticMarkup(React.createElement(exports.FiscalMasterFields, { kind: 'customer', value: {}, onChange() {}, doProfile: false }))
  assert.match(configured, /E31 — Crédito fiscal/)
  assert.doesNotMatch(ordinary, /E31 — Crédito fiscal/)
  assert.match(configured, /<option value="CEDULA">Cédula<\/option>/)
  const supplier = renderToStaticMarkup(React.createElement(exports.FiscalMasterFields, { kind: 'supplier', value: { fiscalDeclaredCondition:'Texto anterior' }, onChange() {} }))
  assert.match(supplier, /<option value="REGISTRADO">Contribuyente registrado<\/option>/)
  assert.match(supplier, /<option value="Texto anterior" selected="">Texto anterior<\/option>/)
})
