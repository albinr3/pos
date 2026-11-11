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

// Renderizar el botón real evita que un stub oculte una regresión de activo a «Activar».
const activation = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/app/(app)/settings/fiscal-settings-activation.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: activation, require(name) {
  if (name === 'react' || name === 'react/jsx-runtime') return require(name)
  if (name === '@/components/ui/button') return { Button: ({ children }) => require('react').createElement('button', null, children) }
  if (name === '@/components/ui/alert-dialog') return Object.fromEntries(['AlertDialog', 'AlertDialogAction', 'AlertDialogCancel', 'AlertDialogContent', 'AlertDialogDescription', 'AlertDialogFooter', 'AlertDialogHeader', 'AlertDialogTitle', 'AlertDialogTrigger'].map(key => [key, ({ children }) => children]))
  if (name === './fiscal-settings-form') return { FiscalSettingsForm: () => null }
  throw Error(`Dependencia no prevista: ${name}`)
} })

async function render(user, access = true, fiscalEnabled = false) {
  const exports = {}, checks = []
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'react/jsx-runtime') return require(name)
    if (name === '@/lib/db') return { prisma: { fiscalSettings: { findUnique: async () => fiscalEnabled === null ? null : ({ enabled: fiscalEnabled }) } } }
    if (name === '@/lib/auth') return { getCurrentUser: async () => user }
    if (name === '@/lib/module-access') return { requireModuleAccess: async permission => { checks.push(permission); if (!access) throw new Error('Sin acceso a ajustes') } }
    if (name === 'next/navigation') return { redirect() { throw new Error('Redirección a login') } }
    if (name === './settings-client') return { SettingsClient: ({ fiscalSection }) => fiscalSection }
    if (name === './fiscal-settings-activation') return activation
    if (name === './fiscal-sequences') return { FiscalSequences: () => require('react').createElement('div', null, 'Secuencias fiscales autorizadas') }
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

test('Las secuencias permanecen ocultas mientras el módulo está apagado', async () => {
  const { html } = await render({ id: 'fixture', isOwner: true })
  assert.doesNotMatch(html, /Secuencias fiscales autorizadas/)
})

test('La descarga del historial solo aparece para el dueño con configuración activa', async () => {
  for (const enabled of [null, false, true]) {
    const { html } = await render({ id: 'fixture', isOwner: true }, true, enabled)
    assert.equal(html.includes('Descargar historial fiscal'), enabled === true)
    assert.equal(html.includes('/api/fiscal/history/export'), enabled === true)
    assert.match(html, /Configuración fiscal/)
  }
  const { html } = await render({ id: 'fixture', canManageFiscalSettings: true }, true, true)
  assert.doesNotMatch(html, /Descargar historial fiscal|\/api\/fiscal\/history\/export/)
})

test('Solo un usuario autorizado ve las secuencias con el módulo activo', async () => {
  for (const user of [{ isOwner: true }, { canManageFiscalSequences: true }]) {
    const { html } = await render({ id: 'fixture', ...user }, true, true)
    assert.match(html, /Secuencias fiscales autorizadas/)
  }
  const { html } = await render({ id: 'fixture', canPrepareFiscalDocuments: true }, true, true)
  assert.doesNotMatch(html, /Secuencias fiscales autorizadas/)
})

test('La cuenta activa muestra su estado y editar, sin ofrecer activar de nuevo', async () => {
  for (const user of [{ isOwner: true }, { canManageFiscalSettings: true }]) {
    const { html } = await render({ id: 'fixture', ...user }, true, true)
    assert.match(html, /Configuración fiscal activa · Ambiente de prueba/)
    assert.match(html, /Editar configuración fiscal/)
    assert.doesNotMatch(html, />Activar<|¿Seguro que quieres activar/)
    assert.match(html, /Pendiente de conexión/)
  }
})

test('La cuenta apagada indica inactiva y ofrece activar solo al configurador', async () => {
  const { html } = await render({ id: 'fixture', isOwner: true })
  assert.match(html, /Configuración fiscal inactiva/)
  assert.match(html, />Activar</)
  assert.doesNotMatch(html, /Editar configuración fiscal/)
  const viewer = await render({ id: 'fixture', canViewFiscalDocuments: true })
  assert.match(viewer.html, /Configuración fiscal inactiva/)
  assert.doesNotMatch(viewer.html, />Activar</)
})

test('El formulario cambia los botones según la respuesta guardada al activar y desactivar', async () => {
  const state = [], requests = []
  let cursor = 0, refreshes = 0
  let saved = { enabled: false, version: 1, jurisdiction: 'DO', regime: 'DO_ECF', environment: 'TEST',
    legalName: 'Empresa', taxId: '123456789', fiscalAddress: 'Dirección', fiscalEmail: 'empresa@example.test',
    fiscalPhone: null, configurationStatus: 'VALIDATED', missingFields: [], effectiveFrom: null }
  const form = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/app/(app)/settings/fiscal-settings-form.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: form, fetch: async (url, options) => {
    const body = JSON.parse(options.body)
    requests.push(body)
    saved = { ...saved, ...body, enabled: body.enabled ?? saved.enabled, version: saved.version + 1 }
    return { ok: true, json: async () => saved }
  }, require(name) {
    if (name === 'react/jsx-runtime') return require(name)
    if (name === 'react') return { useEffect() {}, useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = index === 0 ? saved : initial
      return [state[index], value => { state[index] = value }]
    } }
    if (name === 'next/navigation') return { useRouter: () => ({ refresh: () => { refreshes++ } }) }
    throw Error(`Dependencia no prevista: ${name}`)
  } })
  const draw = () => { cursor = 0; return form.FiscalSettingsForm() }
  const findButton = (node, label) => {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'button' && node.props.children === label) return node
    for (const child of require('react').Children.toArray(node.props?.children)) {
      const found = findButton(child, label)
      if (found) return found
    }
    return null
  }
  let tree = draw()
  assert.ok(findButton(tree, 'Guardar y activar'))
  tree.props.onSubmit({ preventDefault() {} })
  await new Promise(resolve => setImmediate(resolve))
  tree = draw()
  assert.equal(requests[0].enabled, true)
  assert.match(renderToStaticMarkup(tree), /Módulo: activo/)
  assert.ok(findButton(tree, 'Guardar configuración fiscal'))
  assert.equal(findButton(tree, 'Guardar y activar'), null)
  // Editar datos de una cuenta activa no debe enviar otra activación ni apagarla.
  tree.props.onSubmit({ preventDefault() {} })
  await new Promise(resolve => setImmediate(resolve))
  tree = draw()
  assert.equal(Object.hasOwn(requests[1], 'enabled'), false)
  assert.equal(saved.enabled, true)
  findButton(tree, 'Desactivar módulo').props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  tree = draw()
  assert.equal(requests[2].enabled, false)
  assert.match(renderToStaticMarkup(tree), /Módulo: inactivo/)
  assert.ok(findButton(tree, 'Guardar y activar'))
  assert.equal(refreshes, 3)
})
