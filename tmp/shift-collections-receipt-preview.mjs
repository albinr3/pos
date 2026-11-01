import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import {createRequire} from 'node:module'; import {fileURLToPath} from 'node:url'; import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import ts from 'typescript'; import postcss from 'postcss'; import tailwindcss from 'tailwindcss';
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


const movements=[{sourceType:'sale',method:'EFECTIVO',amountCents:10000},{sourceType:'payment',method:'TARJETA',amountCents:20000},{sourceType:'sale',method:'TRANSFERENCIA',amountCents:30000},{sourceType:'operatingExpense',method:'EFECTIVO',amountCents:-5000}]; const markup=await receiptHtml(movements); const css=(await postcss([tailwindcss('./tailwind.config.ts')]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css; fs.writeFileSync('tmp/shift-collections-receipt.html', '<!doctype html><html><meta charset="utf-8"><style>'+css+'</style><body>'+markup+'</body></html>');