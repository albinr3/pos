// Regresión: guardar un perfil no debe mostrar operaciones fiscales; el historial conserva lectura.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const owner = { id: 'usuario', accountId: 'cuenta', isOwner: true }
const permission = (user, key) => Boolean(user?.isOwner || user?.[key])
const redirect = path => { throw Error(`redirect:${path}`) }

function load(file, dependencies = {}, source = fs.readFileSync(file, 'utf8')) {
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'react/jsx-runtime') return require(name)
    assert.ok(name in dependencies, `Dependencia sin simular: ${name}`)
    return dependencies[name]
  } })
  return exports
}

function harness(file, enabled, user = owner) {
  const seen = {}
  const component = name => function MockComponent(props) {
    seen[name] = props
    return React.createElement('span', null, name)
  }
  const settings = enabled === null ? null : { enabled, version: 2 }
  const dependencies = {
    '@/lib/auth': { getCurrentUser: async () => user, hasSubUserSession: async () => true,
      hasClerkSession: async () => true, isInitialSetupComplete: async () => true,
      getCurrentUserBillingState: async () => null },
    '@/lib/module-access': { requireModuleAccess: async () => user },
    '@/lib/permissions': { hasPermission: permission },
    '@/lib/db': { prisma: {
      fiscalSettings: { findUnique: async ({ where, select }) => {
        assert.equal(where.accountId, 'cuenta')
        if (select) assert.equal(select.enabled, true)
        return settings
      } },
      cashControl: { findUnique: async () => ({ enabled: false }) },
    } },
    '@/lib/fiscal/core/policy': {
      getFiscalCapabilities: async () => ({ policy: { enabled: enabled === true }, operations: { prepare: enabled === true && permission(user, 'canPrepareFiscalDocuments') } }),
      resolveFiscalPolicy: async () => ({ enabled: enabled === true }),
    },
    'next/navigation': { redirect },
    'next/headers': { headers: async () => new Map() },
    'next/link': { default: ({ children }) => React.createElement('a', null, children) },
    'lucide-react': { Receipt: () => null },
    '@/components/ui/card': Object.fromEntries(['Card', 'CardHeader', 'CardTitle', 'CardContent'].map(name => [name, ({ children }) => React.createElement('div', null, children)])),
    '@/components/ui/button': { Button: ({ children }) => React.createElement('button', null, children) },
    '@/components/app/cash-shift-gate': { CashShiftGate: ({ children }) => children },
    '../treasury/actions': { listTreasuryAccounts: async () => [] },
    '../../treasury/actions': { listTreasuryAccounts: async () => [] },
    './payables-client': { AccountsPayableClient: component('ordinario-ap') },
    './foreign-payments': { ForeignPayments: component('fiscal-ap') },
    './ar-client': { ARClient: component('ordinario-ar') },
    './fiscal-customer-credits': { FiscalCustomerCredits: component('fiscal-ar') },
    './operating-expenses-client': { OperatingExpensesClient: component('ordinario-gastos') },
    './fiscal-expenses': { FiscalExpenses: component('fiscal-gastos') },
    './ui': { FiscalInbox: component('bandeja') },
    '../ui': { FiscalEditor: component('editor'), FiscalDetail: component('detalle') },
    '../../returns/fiscal-credit-form': { FiscalCreditForm: component('nota-credito') },
    './debit-form': { DebitNoteForm: component('nota-debito') },
    '@/components/app/app-shell': { AppShell: component('shell') },
    '@/components/app/billing-banner': { BillingBanner: () => null },
    '@/components/app/billing-redirect': { BillingRedirect: () => null },
    '@/components/app/theme-provider': { ThemeProvider: ({ children }) => children },
    '@/components/ui/toaster': { Toaster: () => null },
  }
  const page = load(`src/app/(app)/${file}`, dependencies).default
  return { seen, render: async () => renderToStaticMarkup(await page({ children: null,
    params: Promise.resolve({ id: 'documento' }), searchParams: Promise.resolve({ originalDocumentId: 'original' }),
  })) }
}

for (const enabled of [null, false, true]) {
  test(`activación ${enabled}: paneles fiscales y flujo ordinario`, async () => {
    for (const [file, panel, ordinary] of [
      ['ap/page.tsx', 'fiscal-ap', 'ordinario-ap'],
      ['ar/page.tsx', 'fiscal-ar', 'ordinario-ar'],
      ['operating-expenses/page.tsx', 'fiscal-gastos', 'ordinario-gastos'],
    ]) {
      const h = harness(file, enabled)
      const html = await h.render()
      assert.equal(html.includes(panel), enabled === true, file)
      assert.ok(html.includes(ordinary), `${file}: conservar interfaz ordinaria`)
      if (ordinary === 'ordinario-ap') assert.equal(h.seen[ordinary].canViewFiscal, enabled === true)
      if (ordinary === 'ordinario-gastos') assert.equal(h.seen[ordinary].fiscalEnabled, enabled === true)
    }
    const reports = await harness('reports/page.tsx', enabled).render()
    assert.equal(reports.includes('Fiscal y conciliación'), enabled === true)
    assert.ok(reports.includes('Ver reporte de ventas'))
    const layout = harness('layout.tsx', enabled)
    await layout.render()
    assert.equal(layout.seen.shell.fiscalEnabled, enabled === true)
  })

  test(`activación ${enabled}: proteger formularios por URL y conservar historial`, async () => {
    for (const [file, target] of [
      ['fiscal/documents/new/page.tsx', '/dashboard'],
      ['fiscal/credit-notes/page.tsx', '/returns'],
      ['fiscal/debit-notes/page.tsx', '/dashboard'],
    ]) {
      const h = harness(file, enabled)
      if (enabled === true) await h.render()
      else await assert.rejects(h.render(), { message: `redirect:${target}` })
    }
    for (const [file, name] of [['fiscal/documents/page.tsx', 'bandeja'], ['fiscal/documents/[id]/page.tsx', 'detalle']]) {
      const h = harness(file, enabled)
      await h.render()
      assert.equal(h.seen[name].canPrepare, enabled === true, file)
    }
  })
}

test('bandeja: activación antes del permiso, también para el dueño; navegación ordinaria intacta', () => {
  const source = fs.readFileSync('src/components/app/app-shell.tsx', 'utf8')
  const parsed = ts.createSourceFile('shell.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const fn = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'canAccessNavItem')
  assert.ok(fn)
  const { canAccessNavItem } = load('', {}, `${fn.getText(parsed)}\nexports.canAccessNavItem = canAccessNavItem`)
  for (const user of [owner, { canViewFiscalDocuments: true }, { canViewFiscalDocuments: false }]) {
    assert.equal(canAccessNavItem(user, '/fiscal/documents', false), false)
    assert.equal(canAccessNavItem(user, '/fiscal/documents', true), Boolean(user.isOwner || user.canViewFiscalDocuments))
    assert.equal(canAccessNavItem(user, '/sales', false), true)
  }
  assert.match(source, /canAccessNavItem\(user, item\.href, fiscalEnabled\)/)
  assert.match(source, /\[user, fiscalEnabled\]/)
})

test('activar la cuenta no concede permisos fiscales a un empleado', async () => {
  const employee = { id: 'empleado', accountId: 'cuenta' }
  const ar = await harness('ar/page.tsx', true, employee).render()
  assert.doesNotMatch(ar, /fiscal-ar/)
  const reports = await harness('reports/page.tsx', true, employee).render()
  assert.doesNotMatch(reports, /Fiscal y conciliación/)
  for (const file of ['fiscal/documents/page.tsx', 'fiscal/documents/new/page.tsx', 'fiscal/documents/[id]/page.tsx', 'fiscal/credit-notes/page.tsx', 'fiscal/debit-notes/page.tsx']) {
    await assert.rejects(harness(file, true, employee).render(), { message: 'redirect:/dashboard' })
  }
})
