import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
for (const section of ['customers', 'suppliers', 'products']) {
  test(`${section}: la interfaz fiscal depende de la activación de la cuenta`, async () => {
    const source = fs.readFileSync(new URL(`../src/app/(app)/${section}/page.tsx`, import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    for (const enabled of [false, true, null]) {
      let accountId
      const exports = {}
      vm.runInNewContext(compiled, { exports, require(name) {
        if (name === 'react/jsx-runtime') return require(name)
        if (name === '@/lib/db') return { prisma: { fiscalSettings: { findUnique: async args => { accountId = args.where.accountId; return enabled === null ? null : { enabled, jurisdiction: 'DO', regime: 'DO_ECF' } } } } }
        if (name === '@/lib/auth') return { getCurrentUser: async () => ({ accountId: 'cuenta' }) }
        if (name === '@/lib/module-access') return { requireModuleAccess: async () => ({ accountId: 'cuenta' }) }
        if (name === '@/lib/permissions') return { hasPermission: () => true }
        if (name === 'next/navigation') return { redirect: () => { throw Error('redirect') } }
        if (name === '../onboarding/actions') return { getAccountOnboardingState: async () => null }
        if (name === './fiscal-concepts') return { FiscalConcepts: () => require('react').createElement('i', null, 'conceptos fiscales') }
        if (name === '@/components/inventory-upload-offer') return { InventoryUploadOffer: () => null }
        if (name.endsWith('-client')) return { [section === 'customers' ? 'CustomersClient' : section === 'suppliers' ? 'SuppliersClient' : 'ProductsClient']: props => require('react').createElement('span', null, props.fiscalEnabled ? 'fiscal activo' : 'fiscal apagado') }
        throw Error(`Dependencia inesperada: ${name}`)
      } })
      const html = renderToStaticMarkup(await exports.default({ searchParams: Promise.resolve({}) }))
      assert.equal(accountId, 'cuenta')
      assert.match(html, enabled ? /fiscal activo/ : /fiscal apagado/)
      if (section === 'products') assert.equal(html.includes('conceptos fiscales'), enabled === true)
    }
  })
}
