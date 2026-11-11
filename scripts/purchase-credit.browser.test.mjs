// Componentes React reales; respuestas HTTP controladas para probar formularios y reintentos.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { runBrowserSuite } from "./run-browser-suite.mjs"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
async function browserSuite() {
  const results = [], sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const button = text => [...document.querySelectorAll("button")].find(b => b.textContent.trim() === text)
  const content = () => document.getElementById("test-root").textContent
  async function until(fn, message) { for (let i = 0; i < 300; i++) { if (fn()) return; await sleep(10) } throw new Error(message) }
  async function test(name, run) { try { await run(); results.push({ ok: true, name }) } catch (e) { results.push({ ok: false, name, error: e.message }) } }
  async function fill(input, value) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); await sleep(20) }
  async function choose(select, value) { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); await sleep(20) }
  let view, requests, payments, idempotency, failAfterSave
  const options = { methods: ["EFECTIVO", "TRANSFERENCIA"], accounts: [{ id: "box", name: "Caja", type: "CAJA" }, { id: "bank", name: "Banco", type: "BANCO" }] }
  const ap = () => ({ id: "ap", accountId: "tenant", purchaseId: "purchase", supplierId: "supplier", totalCents: 1000000, paidCents: payments.filter(p => !p.cancelledAt).reduce((sum, p) => sum + p.amountCents, 0), balanceCents: 1000000 - payments.filter(p => !p.cancelledAt).reduce((sum, p) => sum + p.amountCents, 0), dueDate: "2026-12-01", status: payments.length ? "PARCIAL" : "PENDIENTE", supplier: { id: "supplier", name: "Proveedor demo", isActive: true }, purchase: { id: "purchase", supplierName: "Proveedor demo", notes: "", cancelledAt: null }, overdueDays: 0, overdue: false, payments })
  function setupFetch() {
    requests = []; payments = []; idempotency = new Map(); failAfterSave = false
    window.fetch = async (url, init = {}) => {
      const u = new URL(String(url), "https://fixture.test"), body = init.body ? JSON.parse(init.body) : null
      requests.push({ url: String(url), method: init.method ?? "GET", body })
      if (u.pathname.endsWith("/options")) return Response.json(options)
      if (u.pathname === "/api/supplier-payments" && init.method === "POST") {
        let p = idempotency.get(body.operationId)
        if (!p) { p = { ...body, id: `p${payments.length + 1}`, reference: "PP-DEMO", paidAt: new Date().toISOString(), user: { name: "Ana" }, treasuryAccount: { name: body.treasuryAccountId === "bank" ? "Banco" : "Caja" }, cancelledAt: null }; payments.push(p); idempotency.set(body.operationId, p) }
        if (failAfterSave) { failAfterSave = false; throw new TypeError("Respuesta perdida") }
        return Response.json(p)
      }
      if (u.pathname.endsWith("/cancel")) { const p = payments.find(p => u.pathname.includes(p.id)); p.cancelledAt = new Date().toISOString(); p.cancellationReason = body.reason; return Response.json({ id: p.id }) }
      if (u.pathname === "/api/accounts-payable/ap") return Response.json(ap())
      if (u.pathname === "/api/accounts-payable") return Response.json({ data: [ap()], nextSkip: null, summary: { count: 1, totalCents: 1000000, balanceCents: ap().balanceCents, overdueCents: 0 }, providers: [{ supplierId: "supplier", name: "Proveedor demo", totalCents: 1000000, balanceCents: ap().balanceCents, count: 1 }] })
      if (u.pathname === "/api/suppliers") return Response.json({ data: [{ id: "supplier", name: "Proveedor demo" }] })
      if (u.pathname.startsWith("/api/reports/")) {
        if (u.searchParams.has("format")) return new Response(new Blob(["reporte"], { type: "application/pdf" }))
        return Response.json({ title: "Compras", columns: [{ key: "supplier", label: "Proveedor" }, { key: "balanceCents", label: "Pendiente actual", type: "money" }], data: [{ id: "purchase", supplier: "Proveedor demo", balanceCents: 800000 }], summary: { count: 1, balanceCents: 800000 }, nextSkip: null, balanceBasis: "CURRENT", generatedAt: new Date().toISOString() })
      }
      return Response.json({ error: "Ruta no simulada" }, { status: 400 })
    }
  }
  async function mount(component, props = {}) { view?.unmount(); await sleep(20); view = createRoot(document.getElementById("test-root")); view.render(React.createElement(component, props)); await sleep(60) }
  function CreditHarness({ canPay = true }) {
    const [value, setValue] = React.useState({ type: "CONTADO", dueDate: "", initialPaymentCents: 0 })
    return React.createElement(PurchaseCreditFields, { value, onChange: setValue, days: 30, totalCents: 1000000, canPay })
  }
  await test("Formulario de crédito propone vencimiento, calcula saldo y advierte abono total", async () => {
    await mount(CreditHarness)
    await choose(document.getElementById("purchase-type"), "CREDITO")
    assert(document.getElementById("purchase-due").value.length === 10, "No propone vencimiento")
    await fill(document.getElementById("purchase-initial"), "2000")
    assert(content().includes("8,000"), "No calcula el saldo de 8,000")
    await fill(document.getElementById("purchase-initial"), "10000")
    assert(content().includes("Usa Contado"), "Permite abono total sin explicar Contado")
  })
  await test("Revisión: validar el crédito antes de encolar y ocultar abonos sin permiso", async () => {
    assert(!!purchaseCreditError({ type: "CREDITO", dueDate: "", initialPaymentCents: 0 }, 1000000), "Acepta vencimiento vacío")
    assert(!!purchaseCreditError({ type: "CREDITO", dueDate: "2026-12-01", initialPaymentCents: 1000000 }, 1000000), "Acepta abono total")
    assert(!!purchaseCreditError({ type: "CREDITO", dueDate: "2026-12-01", initialPaymentCents: 200000 }, 1000000, false), "Acepta abono sin permiso")
    assert(!purchaseCreditError({ type: "CREDITO", dueDate: "2026-12-01", initialPaymentCents: 200000 }, 1000000), "Rechaza un abono válido")
    await mount(CreditHarness, { canPay: false })
    await choose(document.getElementById("purchase-type"), "CREDITO")
    assert(!document.getElementById("purchase-initial"), "Permite ingresar abonos sin permiso")
  })
  await test("CxP registra un abono y reintenta una respuesta perdida con el mismo ID", async () => {
    setupFetch(); await mount(AccountsPayableClient, { canPay: true, canCancel: true, canEdit: true })
    await until(() => button("Ver cuenta"), "No cargó CxP"); button("Ver cuenta").click()
    await until(() => document.querySelector('[aria-label="Monto del pago"]'), "No abrió la cuenta")
    await fill(document.querySelector('[aria-label="Monto del pago"]'), "2000")
    await choose(document.querySelector('[aria-label="Método de pago"]'), "TRANSFERENCIA")
    failAfterSave = true; button("Registrar pago").click()
    await until(() => document.querySelector('[role="alert"]')?.textContent.includes("Respuesta perdida") && button("Registrar pago"), "No mostró el error")
    button("Registrar pago").click()
    await until(() => document.querySelector('[role="dialog"]')?.textContent.includes("PP-DEMO") && button("Registrar pago") && !button("Procesando…"), "No recuperó el pago")
    const posts = requests.filter(r => r.method === "POST" && r.url === "/api/supplier-payments")
    assert(posts.length === 2 && posts[0].body.operationId === posts[1].body.operationId, "Reintentó con otro identificador")
    assert(payments.length === 1 && ap().balanceCents === 800000, "Duplicó el pago o el saldo")
    assert(posts[0].body.treasuryAccountId === "bank", "No eligió la cuenta bancaria")
  })
  await test("CxP sin permisos de pago/anulación permite consultar pero oculta acciones", async () => {
    setupFetch(); await mount(AccountsPayableClient, { canPay: false, canCancel: false, canEdit: false })
    await until(() => button("Ver cuenta"), "No cargó consulta"); button("Ver cuenta").click()
    await until(() => document.body.textContent.includes("Historial de pagos"), "No abrió detalle")
    assert(!button("Registrar pago") && !button("Anular") && !button("Guardar notas y vencimiento"), "Expuso acciones sin permiso")
  })
  await test("CxP ofrece revisión E41 solo cuando está autorizada", async () => {
    setupFetch(); await mount(AccountsPayableClient, { canPay: false, canCancel: false, canEdit: true, canPrepareE41: true })
    await until(() => button("Ver cuenta"), "No cargó CxP"); button("Ver cuenta").click()
    await until(() => document.querySelector('[role="dialog"] a[href*="source=PURCHASE"]'), "No ofrece revisión E41 de la compra")
    assert(document.querySelector('[role="dialog"] a[href*="sourceId=purchase"]'), "El enlace perdió el origen")
    await mount(AccountsPayableClient, { canPay: false, canCancel: false, canEdit: false, canPrepareE41: false })
    await until(() => button("Ver cuenta"), "No cargó CxP sin permiso"); button("Ver cuenta").click()
    await until(() => document.body.textContent.includes("Historial de pagos"), "No abrió el detalle")
    assert(!document.querySelector('[role="dialog"] a[href*="source=PURCHASE"]'), "Ofreció E41 sin autorización")
  })
  await test("Obligación sin inventario envía el comprobante recibido", async () => {
    setupFetch(); await mount(AccountsPayableClient, { canPay: false, canCancel: false, canEdit: true })
    await until(() => document.querySelector('details summary'), "No cargó el formulario")
    const summary=[...document.querySelectorAll('summary')].find(s=>s.textContent.includes('Registrar obligación sin inventario')); summary.click()
    const form=summary.parentElement.querySelector('form'), labels=[...form.querySelectorAll('label')]
    await choose(form.querySelector('select'), 'supplier')
    await fill(labels.find(l=>l.textContent.includes('Concepto')).querySelector('input'), 'Servicio')
    await fill(labels.find(l=>l.textContent.includes('Comprobante recibido')).querySelector('input'), 'E310000000001')
    await fill(labels.find(l=>l.textContent.includes('Total adeudado')).querySelector('input'), '100')
    await fill(labels.find(l=>l.textContent.includes('Vencimiento')).querySelector('input'), '2099-12-30')
    form.requestSubmit()
    await until(()=>requests.some(r=>r.url==='/api/accounts-payable'&&r.method==='POST'), 'No envió la obligación')
    const body=requests.find(r=>r.url==='/api/accounts-payable'&&r.method==='POST').body
    assert(body.supplierReceiptNumber==='E310000000001'&&body.totalCents===10000, 'Perdió el soporte o el importe')
  })
  await test("Compras ofrece E41 solo al faltar comprobante y estar habilitado", async () => {
    setupFetch(); await mount(PurchasesClient, { canRegisterSupplierPayments:true, canPrepareE41:true })
    await until(()=>document.getElementById('supplier-receipt'), 'No cargó el formulario de compra')
    const choice=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Revisar si corresponde preparar un E41'))
    assert(choice, 'No ofreció revisión E41')
    choice.querySelector('input').click(); await until(()=>document.getElementById('e41-cash-paid'), 'No pidió el importe neto')
    await fill(document.getElementById('supplier-receipt'), 'E310000000001')
    assert(![...document.querySelectorAll('label')].some(l=>l.textContent.includes('Revisar si corresponde preparar un E41')), 'Ofreció E41 con comprobante recibido')
    await mount(PurchasesClient, { canRegisterSupplierPayments:true, canPrepareE41:false })
    assert(![...document.querySelectorAll('label')].some(l=>l.textContent.includes('Revisar si corresponde preparar un E41')), 'Ofreció E41 con el módulo apagado')
  })
  await test("Revisión: efectivo solo ofrece la caja configurada aunque otra aparezca primero", async () => {
    setupFetch()
    const original = options.accounts
    try {
      options.accounts = [{ id: "other-box", name: "A otra caja", type: "CAJA", cashControlEnabled: true, cashControlled: false }, { id: "box", name: "Caja controlada", type: "CAJA", cashControlEnabled: true, cashControlled: true }, { id: "bank", name: "Banco", type: "BANCO" }]
      await mount(AccountsPayableClient, { canPay: true, canCancel: true, canEdit: true })
      await until(() => button("Ver cuenta"), "No cargó CxP"); button("Ver cuenta").click()
      await until(() => document.querySelector('[aria-label="Cuenta de pago"]'), "No abrió formulario")
      const select = document.querySelector('[aria-label="Cuenta de pago"]')
      assert(select.options.length === 1 && select.value === "box", "Ofrece una caja distinta de la controlada")
    } finally { options.accounts = original }
  })
  await test("Revisión: una respuesta atrasada no reemplaza el último filtro de CxP", async () => {
    setupFetch()
    const originalFetch = window.fetch
    let releaseOld
    window.fetch = async (url, init) => {
      const response = await originalFetch(url, init)
      const parsed = new URL(String(url), "https://fixture.test")
      if (parsed.pathname !== "/api/accounts-payable") return response
      const value = await response.json(), query = parsed.searchParams.get("query")
      if (query === "vieja") { value.data[0].purchase.supplierName = "Respuesta vieja"; return new Promise(resolve => { releaseOld = () => resolve(Response.json(value)) }) }
      if (query === "nueva") value.data[0].purchase.supplierName = "Respuesta nueva"
      return Response.json(value)
    }
    await mount(AccountsPayableClient, { canPay: false, canCancel: false, canEdit: false })
    await until(() => button("Ver cuenta"), "No cargó la lista")
    await fill(document.getElementById("ap-search"), "vieja"); button("Filtrar").click()
    await until(() => releaseOld, "No inició la consulta anterior")
    await fill(document.getElementById("ap-search"), "nueva"); button("Filtrar").click()
    await until(() => document.querySelector("tbody")?.textContent.includes("Respuesta nueva"), "No cargó el filtro nuevo")
    releaseOld(); await sleep(80)
    assert(document.querySelector("tbody").textContent.includes("Respuesta nueva"), "Una respuesta atrasada reemplazó el filtro nuevo")
  })
  await test("Reportes aplican idénticos filtros al JSON y a los archivos", async () => {
    setupFetch(); await mount(PurchaseReportClient, { kind: "purchases" })
    await until(() => button("Descargar Excel"), "No cargó reporte")
    const inputs = [...document.querySelectorAll('input[type="date"]')]
    await fill(inputs[0], "2026-09-01"); await fill(inputs[1], "2026-09-30")
    const condition = [...document.querySelectorAll("select")].find(s => [...s.options].some(o => o.value === "CREDITO"))
    await choose(condition, "CREDITO"); button("Aplicar filtros").click()
    await until(() => requests.some(r => r.url.includes("type=CREDITO")), "No aplicó filtros")
    button("Descargar Excel").click(); button("Descargar PDF").click()
    await until(() => requests.filter(r => r.url.includes("format=")).length === 2, "No solicitó archivos")
    for (const r of requests.filter(r => r.url.includes("format="))) assert(r.url.includes("type=CREDITO") && r.url.includes("from=2026-09-01") && r.url.includes("to=2026-09-30"), "La exportación perdió filtros")
  })
  view?.unmount(); document.getElementById("result").textContent = JSON.stringify(results)
}
const compiled = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PurchaseCreditFields,purchaseCreditError} from './src/components/app/purchase-credit-fields'; import {AccountsPayableClient} from './src/app/(app)/ap/payables-client'; import {PurchasesClient} from './src/app/(app)/purchases/purchases-client'; import {PurchaseReportClient} from './src/components/app/purchase-report-client'; (${browserSuite.toString()})().catch(error=>document.getElementById('result').textContent=JSON.stringify([{ok:false,error:error.stack}]));`, resolveDir: root },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "credit-browser-boundaries", setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "credit-test" }))
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "credit-test" }))
    build.onResolve({ filter: /^(\.\/actions|\.\.\/suppliers\/actions|\.\.\/settings\/actions)$/ }, args => args.importer.endsWith("purchases-client.tsx") ? { path:"purchase-actions", namespace:"credit-test" } : null)
    build.onResolve({ filter: /cash-offline$/ }, () => ({ path: "cash", namespace: "credit-test" }))
    build.onLoad({ filter: /.*/, namespace: "credit-test" }, args => ({ contents: args.path === "cash" ? 'export async function submitControlledDocument(){ return undefined }' : args.path === "navigation" ? 'export function useRouter(){return {push(){},refresh(){}}}' : args.path === "purchase-actions" ? 'export async function createPurchase(){}; export async function listPurchases(){return []}; export async function searchProductsForPurchase(){return []}; export async function getPurchasePaymentAccounts(){return []}; export async function getAllSuppliers(){return []}; export async function getSettings(){return {defaultProfitMarginBp:3000,itbisRateBp:1800,salePricesIncludeItbis:true}}' : 'import React from "react"; export default function Link(props){return React.createElement("a",props)}', resolveDir: root }))
  } }],
})
await runBrowserSuite(root, "cash-purchase-credit-browser", `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="test-root"></div><pre id="result">RUNNING</pre><script>${compiled.outputFiles[0].text}</script>`)
