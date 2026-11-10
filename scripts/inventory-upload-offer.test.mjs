import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
function load(file, imports) {
  const exports = {}
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(compiled, { exports, require: name => {
    if (name in imports) return imports[name]
    if (name === "react/jsx-runtime") return require(name)
    throw new Error(`Dependencia inesperada: ${name}`)
  } })
  return exports
}

function fixture() {
  let user = { accountId: "A", id: "empleado1" }
  const accounts = new Map([...["A", "B"].map(id => [id, { inventoryUploadOfferDismissed: false }])])
  const paths = []
  const imports = {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/db": { prisma: { account: {
      findUnique: async ({ where }) => accounts.get(where.id),
      update: async ({ where, data }) => Object.assign(accounts.get(where.id), data),
    } } },
    "next/cache": { revalidatePath: path => paths.push(path) },
    "./inventory-upload-offer-client": { InventoryUploadOfferClient: () => null },
  }
  const actions = load("src/app/(app)/inventory-upload-offer-actions.ts", imports)
  imports["@/app/(app)/inventory-upload-offer-actions"] = actions
  const { InventoryUploadOffer } = load("src/components/inventory-upload-offer.tsx", imports)
  return { actions, paths, render: (props = {}) => InventoryUploadOffer(props), login: value => { user = value } }
}

test("El cierre persiste al renderizar de nuevo y cambiar de empleado, sin afectar otras cuentas", async () => {
  const f = fixture()
  assert.equal((await f.render()).props.dismissible, true)
  await f.actions.dismissInventoryUploadOffer()
  f.login({ accountId: "A", id: "empleado2" })
  for (const variant of ["default", "compact"]) assert.equal(await f.render({ variant }), null)
  f.login({ accountId: "B", id: "empleado3" })
  assert.equal((await f.render()).props.dismissible, true)
  assert.deepEqual(f.paths, ["/products", "/onboarding/completado", "/como-usar-la-plataforma"])
})

test("Un visitante ve la oferta pública pero no puede modificar ninguna cuenta", async () => {
  const f = fixture()
  f.login(null)
  const banner = await f.render()
  assert.equal(banner.props.dismissible, false)
  assert.equal(banner.props.onDismiss, undefined)
  await assert.rejects(f.actions.dismissInventoryUploadOffer(), /No autenticado/)
})

test("El botón espera el guardado y conserva el aviso si falla, permitiendo reintentar", async () => {
  let states = [], cursor = 0, fail = true, clicks = 0
  const messages = []
  const { InventoryUploadOfferClient } = load("src/components/inventory-upload-offer-client.tsx", {
    react: { useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value }] } },
    "lucide-react": { MessageCircle: "i", Upload: "i", X: "i" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/card": { Card: "section", CardContent: "div" },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "@/hooks/use-toast": { toast: message => messages.push(message) },
    "@/lib/inventory-upload-offer": { INVENTORY_UPLOAD_OFFER: {}, buildInventoryUploadWhatsAppUrl: () => "https://example.com" },
  })
  const render = () => { cursor = 0; return InventoryUploadOfferClient({ dismissible: true, onDismiss: async () => { clicks++; if (fail) throw Error("sin conexión") } }) }
  const button = tree => {
    if (!tree || typeof tree !== "object") return null
    if (tree.props?.onClick) return tree
    for (const child of [tree.props?.children].flat()) { const found = button(child); if (found) return found }
    return null
  }
  const pending = button(render()).props.onClick()
  assert.equal(button(render()).props.disabled, true)
  await pending
  assert.ok(render())
  assert.equal(messages.length, 1)
  fail = false
  await button(render()).props.onClick()
  assert.equal(render(), null)
  assert.equal(clicks, 2)
})
