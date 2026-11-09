// Renderiza la página real con identidades simuladas; no inicia sesión ni usa la red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const source = fs.readFileSync(new URL('../src/app/(app)/settings/page.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText

async function render(user, access = true) {
  const exports = {}, checks = []
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'react/jsx-runtime') return require(name)
    if (name === '@/lib/auth') return { getCurrentUser: async () => user }
    if (name === '@/lib/module-access') return { requireModuleAccess: async permission => { checks.push(permission); if (!access) throw new Error('Sin acceso a ajustes') } }
    if (name === 'next/navigation') return { redirect() { throw new Error('Redirección a login') } }
    if (name === './settings-client') return { SettingsClient: () => null }
    throw new Error(`Dependencia no prevista: ${name}`)
  } })
  const page = await exports.default()
  return { html: renderToStaticMarkup(page), checks }
}

for (const permission of ['isOwner', 'canManageFiscalSettings', 'canManageFiscalSequences', 'canPrepareFiscalDocuments', 'canViewFiscalDocuments']) {
  test(`Ajustes muestra preparación fiscal para ${permission}`, async () => {
    const { html, checks } = await render({ id: 'fixture', [permission]: true })
    assert.deepEqual(checks, ['canAccessSettings'])
    assert.match(html, /Configuración fiscal/)
    assert.match(html, /Pendiente de conexión/)
    assert.doesNotMatch(html, /Empresa autorizada|Listo para emitir/)
  })
}

test('Ajustes no muestra la tarjeta a un usuario sin permisos fiscales', async () => {
  const { html } = await render({ id: 'fixture', canAccessSettings: true })
  assert.doesNotMatch(html, /Configuración fiscal|Pendiente de conexión/)
})

test('La tarjeta fiscal no evita el requisito de acceso a Ajustes', async () => {
  await assert.rejects(render({ id: 'fixture', canViewFiscalDocuments: true }, false), /Sin acceso a ajustes/)
})
