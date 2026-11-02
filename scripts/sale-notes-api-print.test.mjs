// Rutas y plantillas reales con autenticación y almacenamiento simulados; sin tocar datos del negocio.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createRequire } from "node:module"
import ts from "typescript"
import { renderToStaticMarkup } from "react-dom/server"

const require = createRequire(import.meta.url)
function loader(mocks) {
  const cache = new Map()
  function load(name) {
    if (name in mocks) return mocks[name]
    if (cache.has(name)) return cache.get(name)
    if (name === "@prisma/client" || name === "react/jsx-runtime") return require(name)
    assert.ok(name.startsWith("@/"), `Importación sin simular: ${name}`)
    const path = new URL(`../src/${name.slice(2)}`, import.meta.url)
    const file = [path, new URL(`${path}.ts`), new URL(`${path}.tsx`)].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    assert.ok(file, `Módulo no encontrado: ${name}`)
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    const exports = {}
    cache.set(name, exports)
    vm.runInNewContext(compiled, { exports, require: load, Date, URL, Error, console }, { filename: name })
    return exports
  }
  return load
}

const actor = { id: "employee", accountId: "account-A", username: "ana", name: "Ana", isOwner: true }
const body = { customerId: null, type: "CONTADO", paymentMethod: "EFECTIVO", items: [{ productId: "pan", qty: 1, unitPriceCents: 100 }] }
const request = payload => ({ json: async () => payload, nextUrl: new URL("https://example.test/api/sales"), headers: new Headers() })
const params = { params: Promise.resolve({ id: "sale" }) }

function fixture(notes = null) {
  let created = 0
  const sale = { id: "sale", invoiceCode: "A-00001", type: "CONTADO", notes, soldAt: new Date("2026-11-02T16:00:00Z"), items: [], payments: [], customer: null, subtotalCents: 100, itbisCents: 0, totalCents: 100, salePricesIncludeItbis: true }
  const prisma = {
    companySettings: { findFirst: async () => null },
    sale: {
      findMany: async ({ where }) => { assert.equal(where.accountId, actor.accountId); return [sale] },
      findFirst: async ({ where }) => { assert.equal(where.accountId, actor.accountId); return sale },
    },
  }
  const auth = { getCurrentUserFromRequest: async () => actor }
  const nullComponent = () => null
  const mocks = {
    "next/server": { NextResponse: { json: (data, options = {}) => ({ status: options.status ?? 200, data }) } },
    "next/navigation": { notFound: () => { throw new Error("Not found") } },
    "next/link": { default: nullComponent, __esModule: true },
    "../_helpers/auth": auth,
    "../../_helpers/auth": auth,
    "@/lib/auth": { getCurrentUser: async () => actor },
    "@/lib/db": { prisma },
    "@/lib/cash-http": { cashErrorResponse: () => null },
    "@/lib/cash-context": { cashRequest: { run: (_scope, fn) => fn() }, cashDeviceHashFromRequest: () => "device" },
    "@/lib/customer-display": { formatCustomerName: () => "Consumidor final", isGenericCustomerQuery: () => false },
    "@/lib/date-time": { formatDateDO: date => date.toISOString(), formatDateTimeDO: date => date.toISOString() },
    "@/lib/money": { formatRD: cents => `${cents / 100}` },
    "@/lib/payment-methods": { formatPaymentWithBank: method => method },
  }
  for (const name of ["print-button", "auto-print-on-load", "download-receipt-pdf-button"]) {
    const exportName = { "print-button": "PrintButton", "auto-print-on-load": "AutoPrintOnLoad", "download-receipt-pdf-button": "DownloadReceiptPdfButton" }[name]
    mocks[`@/components/app/${name}`] = { [exportName]: nullComponent }
  }
  mocks["@/components/ui/button"] = { Button: nullComponent }
  // Las demás operaciones de caja no se ejecutan en estos casos.
  for (const name of ["@/app/(app)/ar/actions", "@/lib/cash-financial-db", "@/lib/accounts-payable", "@/app/(app)/purchases/actions", "@/app/(app)/purchases/ocr-actions", "@/app/(app)/operating-expenses/actions", "@/app/(app)/returns/actions", "@/app/(app)/treasury/actions"]) mocks[name] = {}
  const load = loader(mocks)
  const { normalizeSaleNotes } = load("@/lib/sale-notes")
  mocks["@/app/(app)/sales/actions"] = {
    createSale: async input => {
      const normalized = normalizeSaleNotes(input.notes)
      created++
      return { ...sale, notes: normalized }
    },
    updateSale: async input => {
      assert.equal(Object.hasOwn(input, "notes"), false, "La edición no debe reenviar cambios de nota")
    },
  }
  return { load, sale, created: () => created }
}

test("POST móvil acepta notas, normaliza el texto y mantiene clientes sin el campo", async () => {
  for (const [notes, expected] of [["  Entregar mañana.\nLlamar a José.  ", "Entregar mañana.\nLlamar a José."], [null, null], [undefined, null], [" \n ", null], ["á".repeat(1000), "á".repeat(1000)]]) {
    const f = fixture()
    const response = await f.load("@/app/api/sales/route").POST(request({ ...body, ...(notes === undefined ? {} : { notes }) }))
    assert.equal(response.status, 201)
    assert.equal(response.data.notes, expected)
    assert.equal(f.created(), 1)
  }
})

test("POST móvil rechaza notas inválidas con HTTP 400 antes de crear una venta", async () => {
  for (const notes of [123, false, {}, [], "x".repeat(1001)]) {
    const f = fixture()
    const response = await f.load("@/app/api/sales/route").POST(request({ ...body, notes }))
    assert.equal(response.status, 400)
    assert.match(response.data.error, /nota de la venta/)
    assert.equal(f.created(), 0)
  }
})

test("Listado y detalle móvil entregan notes como texto o null", async () => {
  for (const notes of ["Retirar por el almacén.\nJosé", null]) {
    const f = fixture(notes)
    const list = await f.load("@/app/api/sales/route").GET(request())
    const detail = await f.load("@/app/api/sales/[id]/route").GET(request(), params)
    assert.equal(list.status, 200)
    assert.equal(list.data.data[0].notes, notes)
    assert.equal(detail.status, 200)
    assert.equal(detail.data.notes, notes)
  }
})

test("Operaciones de caja conservan la nota en result y validan el mismo contrato", async () => {
  for (const [notes, status] of [["Entregar mañana.\nJosé", 200], [null, 200], [[], 400], ["x".repeat(1001), 400]]) {
    const f = fixture()
    const response = await f.load("@/app/api/cash-shifts/operations/route").POST(request({ kind: "sale", payload: { ...body, notes }, cashOperation: { clientOperationId: "stable" } }))
    assert.equal(response.status, status)
    assert.equal(f.created(), status === 200 ? 1 : 0)
    if (status === 200) assert.equal(response.data.result.notes, notes)
    else assert.match(response.data.error, /nota de la venta/)
  }
})

test("Editar otros datos de la venta no permite reemplazar o borrar la nota", async () => {
  for (const notes of [null, "Intento de reemplazo"]) {
    const f = fixture("Nota original")
    f.sale.items = [{ productId: "pan", qty: 1, unitPriceCents: 100, recipeAdjustments: [] }]
    const route = f.load("@/app/api/sales/[id]/route")
    const response = await route.PUT(request({ ...body, notes }), params)
    assert.equal(response.status, 200)
    assert.equal((await route.GET(request(), params)).data.notes, "Nota original")
  }
})

test("Factura carta y térmica imprimen la nota escapada antes del agradecimiento", async () => {
  for (const path of ["@/app/invoices/[invoiceCode]/page", "@/app/receipts/sale/[invoiceCode]/page"]) {
    for (const type of ["CONTADO", "CREDITO"]) {
      const f = fixture("Entregar mañana.\nJosé <script>alert('hola')</script> & " + "á".repeat(500))
      f.sale.type = type
      const page = await f.load(path).default({ params: Promise.resolve({ invoiceCode: "A-00001" }), searchParams: Promise.resolve({}) })
      const html = renderToStaticMarkup(page)
      assert.match(html, /data-sale-notes/)
      assert.match(html, /Entregar mañana\.\nJosé &lt;script&gt;/)
      assert.doesNotMatch(html, /<script>/)
      assert.match(html, /whitespace-pre-wrap break-words/)
      assert.ok(html.indexOf("data-sale-notes") < html.indexOf("Gracias por su compra"))
      if (path.includes("invoices")) assert.match(html, /Precios con ITBIS incluido\./)
      if (process.env.SALE_NOTES_PRINT_PREVIEW && type === "CONTADO") {
        const format = path.includes("invoices") ? "carta" : "80mm"
        fs.writeFileSync(new URL(`../tmp/sale-notes-${format}.html`, import.meta.url), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="sale-notes-print.css">${html}`)
      }
    }
    for (const notes of [null, "", " \n "]) {
      const f = fixture(notes)
      const page = await f.load(path).default({ params: Promise.resolve({ invoiceCode: "A-00001" }), searchParams: Promise.resolve({}) })
      assert.doesNotMatch(renderToStaticMarkup(page), /data-sale-notes/)
    }
  }
})
