import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/lib/cash-money.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const exports = {}
vm.runInNewContext(compiled, { exports })
const { shiftCollectionsByMethod, documentLegs } = exports
const amounts = rows => Object.fromEntries(shiftCollectionsByMethod(rows).map(item => [item.method, item.totalCents]))
const movement = (sourceType, method, amountCents) => ({ sourceType, method, amountCents })

test("Sin cobros aparecen efectivo, tarjeta y transferencia en cero", () => {
  assert.deepEqual(amounts([]), { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0 })
})

test("Pagos divididos y abonos suman cada método entre varias cuentas", () => {
  const split = documentLegs("sale", { type: "CONTADO", payments: [
    { treasuryAccountId: "caja", method: "EFECTIVO", amountCents: 4000 },
    { treasuryAccountId: "banco-1", method: "TARJETA", amountCents: 6000 },
  ] }).map(leg => ({ ...leg, sourceType: "sale" }))
  assert.deepEqual(amounts([...split, movement("payment", "TRANSFERENCIA", 2500), movement("sale", "TARJETA", 1200), movement("payment", "EFECTIVO", 500)]), { EFECTIVO: 4500, TARJETA: 7200, TRANSFERENCIA: 2500 })
  assert.equal(documentLegs("sale", { type: "CREDITO", totalCents: 9999, treasuryAccountId: "caja", paymentMethod: "EFECTIVO" }).length, 0)
})

test("Fondo, diferencias, gastos, compras, devoluciones y traspasos no son cobros", () => {
  const excluded = ["BASELINE", "OPENING_DIFFERENCE", "CLOSING_DIFFERENCE", "OWNER_IN", "OWNER_OUT", "treasuryOpeningBalance", "treasuryTransfer", "purchase", "operatingExpense", "return"]
  assert.deepEqual(amounts([movement("sale", "TARJETA", 10000), ...excluded.map(source => movement(source, "TARJETA", -1700))]), { EFECTIVO: 0, TARJETA: 10000, TRANSFERENCIA: 0 })
})

test("Anulaciones, cambios de método y ajustes negativos conservan su signo", () => {
  const rows = [movement("sale", "EFECTIVO", 10000), movement("sale", "EFECTIVO", -10000), movement("sale", "TRANSFERENCIA", 10000), movement("payment", "TARJETA", 2000), movement("payment", "TARJETA", -2000), movement("sale", "EFECTIVO", -500)]
  assert.deepEqual(amounts(rows), { EFECTIVO: -500, TARJETA: 0, TRANSFERENCIA: 10000 })
})

test("Otros aparece solo cuando tiene importe, incluso negativo", () => {
  assert.deepEqual(amounts([movement("sale", "OTRO", -100)]), { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0, OTRO: -100 })
  assert.deepEqual(amounts([movement("sale", "OTRO", 100), movement("sale", "OTRO", -100)]), { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0 })
})

test("Instantáneas sin origen no presentan ceros como cobros conocidos", () => {
  assert.equal(shiftCollectionsByMethod([{ method: "TARJETA", amountCents: 5000 }]), null)
})

// Renderizar el comprobante real con sesión y acceso a datos simulados, sin conexiones externas.
async function receiptHtml(movements) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const require = createRequire(import.meta.url)
  const snapshot = { emergency: false, documents: [], movements: movements.map((m, index) => ({ id: String(index), reference: "Registro", treasuryAccount: { name: "Cuenta" }, ...m })) }
  const shift = { id: "saved-shift", cashierName: "Ana", openedAt: new Date("2026-11-01T12:00:00Z"), closedAt: new Date("2026-11-01T18:00:00Z"), openingCountedCents: 50000, openingDifferenceCents: 0, expectedClosingCents: 55000, countedClosingCents: 55000, closingDifferenceCents: 0, closingSnapshot: snapshot }
  const mocks = {
    "@/lib/auth": { getCurrentUser: async () => ({ accountId: "test" }) },
    "@/lib/db": { prisma: { companySettings: { findUnique: async () => ({ name: "Negocio de prueba" }) } } },
    "@/lib/cash-shifts": { getCashReceipt: async () => shift },
    "@/components/app/print-button": { PrintButton: () => null },
    "@/components/app/auto-print-on-load": { AutoPrintOnLoad: () => null },
    "next/link": { default: ({ children }) => React.createElement("a", null, children) },
    "next/navigation": { notFound() { throw new Error("Comprobante no encontrado") } },
  }
  const cache = new Map()
  function load(name) {
    if (name in mocks) return mocks[name]
    if (!name.startsWith("@/")) return require(name)
    if (cache.has(name)) return cache.get(name)
    const base = path.join(root, "src", name.slice(2))
    const filename = fs.existsSync(base + ".ts") ? base + ".ts" : base + ".tsx"
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const exports = {}; cache.set(name, exports)
    vm.runInNewContext(compiled, { exports, require: load, Date, Intl }, { filename })
    return exports
  }
  const page = load("@/app/receipts/cash-shift/[shiftId]/page").default
  return renderToStaticMarkup(await page({ params: Promise.resolve({ shiftId: shift.id }), searchParams: Promise.resolve({}) }))
}

test("El ticket imprime los cobros de la instantánea, separados del efectivo entregado", async () => {
  const html = await receiptHtml([movement("sale", "EFECTIVO", 10000), movement("payment", "TARJETA", 20000), movement("sale", "TRANSFERENCIA", 30000), movement("operatingExpense", "EFECTIVO", -5000)])
  assert.match(html, /Cobros del turno/)
  assert.match(html, /Total cobrado: RD\$600\.00/)
  assert.match(html, /<dt[^>]*>Efectivo<\/dt><dd[^>]*>RD\$100\.00/)
  assert.match(html, /<dt[^>]*>Tarjeta<\/dt><dd[^>]*>RD\$200\.00/)
  assert.match(html, /<dt[^>]*>Transferencia<\/dt><dd[^>]*>RD\$300\.00/)
  assert.match(html, /Efectivo entregado/)
  assert.match(html, /Diferencia de efectivo/)
  assert.match(html, /80mm/)
})

test("Un comprobante antiguo sin origen muestra resumen no disponible", async () => {
  const html = await receiptHtml([{ method: "TARJETA", amountCents: 5000 }])
  assert.match(html, /Resumen de cobros no disponible/)
  assert.doesNotMatch(html, /Total cobrado:/)
})
