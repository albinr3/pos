// POS, React, controles, IndexedDB y outbox reales; servidor simulado y perfil aislado.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { runBrowserSuite } from "./run-browser-suite.mjs"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function browserSuite() {
  const results = []
  let rootView, serial = 0, online = true
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online })
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  function assert(value, message) { if (!value) throw new Error(message) }
  async function until(fn, message) { for (let i = 0; i < 250; i++) { if (fn()) return; await sleep(10) } throw new Error(message) }
  const target = name => document.querySelector(`[data-onboarding-target="${name}"]`)
  const card = name => [...document.querySelectorAll('[data-onboarding-target="sales-product-card"], [data-onboarding-target="sales-product-result"]')].find(button => button.textContent.includes(name))
  const qty = name => document.querySelector(`[aria-label="Cantidad de ${name}"]`)
  const button = name => [...document.querySelectorAll("button")].find(element => element.textContent.trim() === name)
  async function input(element, value) {
    assert(element, "Falta el campo")
    const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
    await sleep(20)
  }
  function basic(id, stock = 2, extra = {}) { return { id, name: id, stock, sku: `${id}-123456789012`, priceCents: 100, itbisRateBp: 0, unit: "UNIDAD", productKind: "BASIC", recipeItems: [], ...extra } }
  async function setup(products, { view = "grid", owner = false, permitted = false, restored = null, cashEnabled = true } = {}) {
    rootView?.unmount(); await sleep(20)
    online = true
    localStorage.clear(); sessionStorage.clear()
    const accountId = `pos-test-${++serial}`
    const f = window.__fixture = { accountId, products, toasts: [], preflights: 0, saves: 0, savedNotes: [], printed: 0, transactions: new Map(), user: { id: accountId, accountId, username: "ana", name: "Ana", isOwner: owner, canSellWithoutStock: permitted } }
    f.snapshot = () => f.products.map(product => ({ ...product, accountId, stockSnapshotAt: Date.now(), recipeItems: product.recipeItems.map(item => ({ ...item, ingredientStock: f.products.find(p => p.id === item.ingredientId)?.stock ?? 0, ingredientIsActive: true })) }))
    f.check = items => {
      f.preflights++
      const products = f.snapshot()
      const lines = items.map(item => ({ ...products.find(product => product.id === item.productId), ...item, recipeAdjustments: item.recipeAdjustments ?? [] }))
      const consumed = getStockConsumptions(lines)
      const inventory = buildStockInventory(products, accountId)
      const issue = owner || permitted ? null : consumed.issue ?? validateStockConsumptions(consumed.consumptions, inventory)
      return { ok: !issue, issue, inventory: [...inventory.values()], consumptions: consumed.consumptions, accountId, userId: f.user.id, allowNegativeStock: owner || permitted, canSellWithoutStock: permitted, isOwner: owner }
    }
    f.save = (items, notes) => {
      const result = f.check(items)
      if (!result.ok) throw new Error(result.issue.message)
      for (const consumption of result.consumptions) f.products.find(product => product.id === consumption.ingredientId).stock -= consumption.qty
      f.saves++
      f.savedNotes.push(notes ?? null)
      return { id: `sale-${f.saves}`, invoiceCode: `A-${f.saves}`, notes: notes ?? null, stockDecrements: result.consumptions }
    }
    const context = { enabled: cashEnabled, fiscalQueuePolicy: { version: 0, enabled: false }, accountId, userId: f.user.id, canOperate: true, treasuryAccountId: "cash", activeShift: { id: accountId, isMine: true, isDevice: true, status: "OPEN", lastSequence: 0 } }
    window.fetch = async (url, options = {}) => {
      if (!online) throw new TypeError("Failed to fetch")
      if (String(url).includes("auth/me")) return Response.json({ user: f.user })
      if (String(url).includes("health-check")) return new Response(null, { status: 200 })
      if (!options.method) return Response.json(context)
      const body = JSON.parse(options.body)
      try {
        const id = body.cashOperation.clientOperationId
        if (!f.transactions.has(id)) { f.transactions.set(id, f.save(body.payload.items, body.payload.notes)); context.activeShift.lastSequence++ }
        if (f.dropNextResponse) { f.dropNextResponse = false; return Promise.reject(new TypeError("Failed to fetch")) }
        return Response.json({ result: f.transactions.get(id) })
      } catch (error) { return Response.json({ error: error.message }, { status: 400 }) }
    }
    window.open = () => { f.printed++; return { closed: false } }
    if (restored) localStorage.setItem("posCartState", JSON.stringify({ timestamp: Date.now(), cart: restored, customerId: "generic", saleType: "CONTADO", paymentMethod: "EFECTIVO" }))
    rootView = createRoot(document.getElementById("test-root"))
    rootView.render(React.createElement(PosClient, { defaultViewMode: view }))
    await until(() => document.querySelector('input[placeholder="Buscar productos"]'), "No montó el POS")
    if (view === "list") await input(document.querySelector('input[placeholder="Buscar productos"]'), products[0].name)
    await until(() => card(products[0].name) && !card(products[0].name).textContent.includes("Sincroniza para validar"), "No cargó el inventario")
    await sleep(80)
    await refreshCashContext()
    return f
  }
  async function test(name, fn) {
    try { await fn(); results.push({ name, ok: true }) }
    catch (error) { results.push({ name, ok: false, error: `${error.message}; avisos: ${JSON.stringify(window.__fixture?.toasts)}; pantalla: ${document.getElementById("test-root").textContent.slice(-350)}` }) }
  }
  async function checkout() {
    target("sales-save-button").click()
    await until(() => target("sales-change-amount"), "No abrió el cobro")
    await input(target("sales-change-amount").querySelector("input"), "100")
    target("sales-change-confirm").click()
    await until(() => !target("sales-change-amount"), "No terminó el guardado")
    await sleep(50)
  }
  await test("Agotados visibles y bloqueados en lista, tarjetas y escáner", async () => {
    for (const view of ["list", "grid"]) {
      const f = await setup([basic("agotado", 0)], { view })
      assert(card("agotado").disabled && card("agotado").textContent.includes("Sin existencia"), "El agotado debe estar bloqueado")
      const search = document.querySelector('input[placeholder="Buscar productos"]')
      await input(search, f.products[0].sku)
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await sleep(80)
      assert(!qty("agotado"), "El escáner no puede agregar agotados")
      assert(!f.toasts.some(toast => toast.title === "Producto agregado"), "No anunciar éxito al rechazar")
      assert(f.saves === 0 && (await cashPending()).filter(p => p.cashOperation.accountId === f.accountId).length === 0, "No debe haber operaciones")
    }
  })
  await test("Selección repetida y botón + respetan la cantidad exacta", async () => {
    await setup([basic("pan", 2)])
    card("pan").click(); await sleep(20); card("pan").click(); await sleep(20)
    assert(qty("pan").value === "2" && card("pan").disabled, "Debe permitir exactamente dos")
    qty("pan").parentElement.querySelectorAll("button")[1].click(); await sleep(20)
    assert(qty("pan").value === "2", "El botón + no puede exceder stock")
  })
  await test("Edición inválida seguida de guardar conserva el carrito sin cobrar", async () => {
    const f = await setup([basic("pan", 2)])
    card("pan").click(); await sleep(20)
    const field = qty("pan"); field.focus(); await input(field, "3"); field.blur()
    target("sales-save-button").click(); await sleep(50)
    assert(qty("pan").value === "1", "Debe conservar la cantidad válida")
    assert(!target("sales-change-amount") && f.saves === 0, "No debe abrir cobro ni guardar por un blur inválido")
  })
  await test("Seleccionar 0,3 kg agrega 0,3 kg", async () => {
    await setup([basic("harina", 0.3, { productKind: "MEASURED", unit: "KG" })])
    card("harina").click(); await sleep(30)
    assert(qty("harina").value === "0.3", "La cantidad debe ser 0.3")
  })
  await test("Carrito restaurado con stock antiguo se bloquea y permite reducir", async () => {
    await setup([basic("pan", 1)], { restored: [{ ...basic("pan", 100), productId: "pan", lineId: "pan", qty: 5, unitPriceCents: 100, recipeAdjustments: [] }] })
    assert(qty("pan").value === "5" && target("sales-save-button").disabled, "No debe confiar en el stock persistido con el carrito")
    const field = qty("pan"); field.focus(); await input(field, "1"); field.blur(); await sleep(30)
    assert(qty("pan").value === "1" && !target("sales-save-button").disabled, "Debe permitir corregir el exceso")
  })
  await test("Recetas sin stock propio usan insumos y rechazan extras que no alcanzan", async () => {
    await setup([basic("receta", 0, { productKind: "RECIPE", recipeItems: [{ ingredientId: "pan", ingredientName: "pan", ingredientUnit: "UNIDAD", qty: 1 }] }), basic("pan", 2)])
    card("receta").click(); await sleep(20); card("pan").click(); await sleep(20)
    assert(qty("receta") && card("receta").disabled, "Debe sumar receta y venta directa")
    button("Personalizar").click(); await sleep(30); button("Extra").click(); await sleep(20)
    document.querySelector('[role="dialog"] input[type="checkbox"]').click(); await sleep(20)
    button("Aplicar ajustes").click(); await sleep(30)
    assert(document.querySelector('[role="dialog"]'), "El extra inválido no debe confirmar ni cerrar")
    assert(qty("receta").value === "1", "Debe conservar la receta")
  })
  await test("Personalizar una unidad valida el consumo de las dos variantes", async () => {
    await setup([basic("receta", 0, { productKind: "RECIPE", recipeItems: [{ ingredientId: "pan", ingredientName: "pan", ingredientUnit: "UNIDAD", qty: 1 }] }), basic("pan", 3)])
    card("receta").click(); await sleep(20); card("receta").click(); await sleep(20)
    button("Personalizar").click(); await sleep(30); button("Extra").click(); await sleep(20)
    document.querySelector('[role="dialog"] input[type="checkbox"]').click(); await sleep(20)
    button("Aplicar ajustes").click(); await sleep(30)
    assert(!document.querySelector('[role="dialog"]'), "El ajuste que consume exactamente tres debe confirmarse")
    const variants = document.querySelectorAll('[aria-label="Cantidad de receta"]')
    assert(variants.length === 2 && [...variants].every(field => field.value === "1"), "Debe dividir normal y extra")
    assert(card("receta").disabled, "Ambas variantes deben consumir todo el insumo")
  })
  await test("Stock cambiado al confirmar efectivo no crea pendientes ni imprime", async () => {
    const f = await setup([basic("pan", 2)])
    card("pan").click(); await sleep(20)
    await input(document.getElementById("sale-notes"), "Conservar si falla")
    target("sales-save-button").click()
    await until(() => target("sales-change-amount"), "No abrió cobro")
    await input(target("sales-change-amount").querySelector("input"), "100")
    f.products[0].stock = 0
    target("sales-change-confirm").click(); await sleep(150)
    assert(f.saves === 0 && f.printed === 0 && qty("pan"), "Debe conservar carrito sin factura")
    assert(document.getElementById("sale-notes").value === "Conservar si falla", "Un error no debe borrar la nota")
    assert((await cashPending()).filter(p => p.cashOperation.accountId === f.accountId).length === 0, "El preflight debe preceder al outbox")
  })
  await test("Pendientes offline reservan stock y la sincronización reconcilia sin duplicar", async () => {
    const f = await setup([basic("pan", 1)])
    online = false; window.dispatchEvent(new Event("offline")); await sleep(100)
    card("pan").click(); await sleep(20)
    await input(document.getElementById("sale-notes"), "Entregar mañana.\nLlamar a José.")
    await checkout()
    const pending = (await cashPending()).filter(p => p.cashOperation.accountId === f.accountId)
    assert(pending.length === 1 && pending[0].stockConsumptions[0].qty === 1, "Debe persistir la reserva con la venta")
    assert(pending[0].payload.notes === "Entregar mañana.\nLlamar a José.", "El outbox debe conservar la nota completa")
    assert(document.getElementById("sale-notes").value === "", "La nota no debe pasar a otra venta")
    assert(card("pan").disabled && !qty("pan"), "Una segunda venta no puede reutilizar la existencia")
    rootView.unmount(); await sleep(20)
    rootView = createRoot(document.getElementById("test-root"))
    rootView.render(React.createElement(PosClient, { defaultViewMode: "grid" }))
    await until(() => card("pan")?.disabled && card("pan").textContent.includes("Sin existencia"), "Recargar offline debe conservar la reserva")
    online = true
    await syncCashOutbox(); await syncCacheData({ force: true }); await sleep(80)
    assert(f.saves === 1 && (await cashPending()).filter(p => p.cashOperation.accountId === f.accountId).length === 0, "Debe confirmar una sola factura")
    assert(f.savedNotes[0] === "Entregar mañana.\nLlamar a José.", "La sincronización debe entregar la nota original")
    assert(card("pan").disabled && f.products[0].stock === 0, "No debe liberar stock al confirmar")
  })
  await test("El flujo sin control de caja también valida y actualiza existencias", async () => {
    const f = await setup([basic("pan", 1)], { cashEnabled: false })
    card("pan").click(); await sleep(20); await checkout()
    assert(f.saves === 1 && f.printed === 1 && card("pan").disabled, "La venta normal debe agotar el producto")
  })
  await test("Nota debajo de Flete se restaura con el carrito y se limpia al facturar", async () => {
    for (const cashEnabled of [true, false]) {
      const f = await setup([basic("pan", 2)], { cashEnabled })
      card("pan").click(); await sleep(20)
      const field = document.getElementById("sale-notes")
      assert(field.maxLength === 1000 && field.tagName === "TEXTAREA", "Debe permitir texto multilínea con límite")
      const labels = [...document.querySelectorAll("label")].map(label => label.textContent)
      assert(labels.indexOf("Nota (opcional)") === labels.indexOf("Flete (opcional)") + 1, "La nota debe ir debajo de Flete")
      await input(field, "  Entregar mañana.\nLlamar a José.  ")
      assert(JSON.parse(localStorage.getItem("posCartState")).notesInput === field.value, "Editar la nota debe guardar el carrito")
      rootView.unmount(); await sleep(20)
      rootView = createRoot(document.getElementById("test-root"))
      rootView.render(React.createElement(PosClient, { defaultViewMode: "grid" }))
      await until(() => document.getElementById("sale-notes")?.value.includes("José"), "Debe restaurar la nota")
      await checkout()
      assert(f.saves === 1 && f.savedNotes[0] === "Entregar mañana.\nLlamar a José.", "Debe enviar la nota normalizada")
      assert(document.getElementById("sale-notes").value === "" && !localStorage.getItem("posCartState"), "Debe limpiar nota y carrito tras guardar")
    }
  })
  await test("Venta offline sin control de caja conserva su nota al sincronizar", async () => {
    const f = await setup([basic("pan", 2)], { cashEnabled: false })
    online = false; window.dispatchEvent(new Event("offline")); await sleep(100)
    card("pan").click(); await sleep(20)
    await input(document.getElementById("sale-notes"), "Retirar por el almacén.")
    await checkout()
    const pending = (await cashPending()).filter(sale => sale.cashOperation.accountId === f.accountId)
    assert(pending.length === 1 && pending[0].payload.notes === "Retirar por el almacén." && pending[0].cashOperation.fiscalPolicyVersion === 0, "Debe persistir la nota y política en la cola sin turnos")
    assert(document.getElementById("sale-notes").value === "", "Debe limpiar la nota tras guardarla offline")
    online = true
    await syncPendingData()
    assert(f.saves === 1 && f.savedNotes[0] === "Retirar por el almacén.", "La sincronización legacy debe enviar la nota")
    assert(!(await cashPending()).some(sale => sale.cashOperation.accountId === f.accountId), "Debe retirar la venta confirmada de la cola")
  })
  await test("Guardar al navegar conserva la nota y descartar o vaciar canasta la limpia", async () => {
    await setup([basic("pan", 2)])
    card("pan").click(); await sleep(20)
    await input(document.getElementById("sale-notes"), "Pedido para José")
    const link = document.createElement("a")
    link.href = "/reports"; link.textContent = "Salir del POS"; document.body.append(link)
    try {
      link.click(); await until(() => button("Sí, guardar"), "No abrió el diálogo de navegación")
      button("Sí, guardar").click(); await sleep(30)
      assert(JSON.parse(localStorage.getItem("posCartState")).notesInput === "Pedido para José", "Navegar con guardar debe conservar la nota")
      link.click(); await until(() => button("No, salir sin guardar"), "No abrió el diálogo para descartar")
      button("No, salir sin guardar").click(); await sleep(30)
      assert(document.getElementById("sale-notes").value === "" && !localStorage.getItem("posCartState"), "Descartar debe limpiar nota y carrito")
      card("pan").click(); await sleep(20)
      await input(document.getElementById("sale-notes"), "Otra nota")
      button("Vaciar canasta").click(); await sleep(30)
      assert(document.getElementById("sale-notes").value === "", "Vaciar canasta no debe dejar la nota anterior")
    } finally { link.remove() }
  })
  await test("Reintentar una venta confirmada sin respuesta conserva la nota y no duplica la factura", async () => {
    const f = await setup([basic("pan", 2)])
    card("pan").click(); await sleep(20)
    await input(document.getElementById("sale-notes"), "Nota del reintento.\nJosé")
    f.dropNextResponse = true
    await checkout()
    const pending = (await cashPending()).filter(row => row.cashOperation.accountId === f.accountId)
    assert(pending.length === 1 && f.saves === 1, "Debe conservar una operación por confirmar")
    assert(pending[0].payload.notes === "Nota del reintento.\nJosé", "El reintento debe conservar la nota original")
    await syncCashOutbox()
    assert(f.saves === 1 && f.savedNotes[0] === "Nota del reintento.\nJosé", "Debe confirmar la misma factura con su nota")
    assert(!(await cashPending()).some(row => row.cashOperation.accountId === f.accountId), "Debe retirar el pendiente confirmado")
  })
  await test("Una nota restaurada que excede el límite no se factura ni se encola", async () => {
    const f = await setup([basic("pan", 2)])
    card("pan").click(); await sleep(20)
    const state = JSON.parse(localStorage.getItem("posCartState"))
    state.notesInput = "x".repeat(1001)
    rootView.unmount(); await sleep(20)
    localStorage.setItem("posCartState", JSON.stringify(state))
    rootView = createRoot(document.getElementById("test-root"))
    rootView.render(React.createElement(PosClient, { defaultViewMode: "grid" }))
    await until(() => document.getElementById("sale-notes")?.value.length === 1001, "No restauró el carrito")
    target("sales-save-button").click(); await until(() => target("sales-change-amount"), "No abrió el cobro")
    await input(target("sales-change-amount").querySelector("input"), "100")
    target("sales-change-confirm").click(); await sleep(80)
    assert(f.saves === 0 && f.toasts.some(toast => toast.title === "Nota inválida"), "Debe rechazar la nota sin guardar")
    assert((await cashPending()).filter(p => p.cashOperation.accountId === f.accountId).length === 0, "No debe crear un pendiente inválido")
    assert(document.getElementById("sale-notes").value.length === 1001, "El error debe permitir corregir la nota")
  })
  await test("Imprime y termina el cobro aunque la precarga siga pendiente, con y sin turnos", async () => {
    for (const cashEnabled of [true, false]) {
      const f = await setup([basic("pan", 1)], { cashEnabled })
      await syncCacheData({ force: true })
      let releaseCache
      f.syncProducts = () => new Promise(resolve => { releaseCache = () => resolve(f.snapshot()) })
      try {
        card("pan").click(); await sleep(20); await checkout()
        assert(releaseCache && f.saves === 1 && f.printed === 1, "La impresión no debe esperar la descarga de productos")
        assert(!qty("pan") && !target("sales-save-button").textContent.includes("Guardando"), "Debe cerrar el cobro y limpiar el carrito")
        assert(card("pan").disabled, "El caché pendiente no debe liberar existencias antiguas")
      } finally {
        releaseCache?.()
        delete f.syncProducts
        await syncCacheData()
      }
      await until(() => card("pan").textContent.includes("Sin existencia"), "Debe reconciliar el inventario al terminar la descarga")
      assert(f.products[0].stock === 0 && f.saves === 1, "El refresco no debe duplicar la venta")
    }
  })
  await test("Una descarga fallida después del commit no repite la factura ni conserva el carrito", async () => {
    const f = await setup([basic("pan", 1)], { cashEnabled: false })
    await syncCacheData({ force: true })
    f.syncProducts = async () => { throw new TypeError("Failed to fetch") }
    try {
      card("pan").click(); await sleep(20); await checkout()
      assert(f.saves === 1 && f.printed === 1 && !qty("pan"), "La venta confirmada debe finalizar aunque falle la precarga")
      assert(card("pan").disabled, "El fallo de precarga debe conservar la protección de stock")
      assert(!f.toasts.some(t => t.title === "Venta guardada (offline)"), "No debe volver a guardar offline una factura confirmada")
    } finally {
      delete f.syncProducts
      await syncCacheData({ force: true })
    }
  })
  await test("Empleado con permiso conserva autorización para vender sin existencia", async () => {
    const f = await setup([basic("pan", 0)], { permitted: true })
    card("pan").click(); await sleep(20); await checkout()
    assert(f.saves === 1 && f.printed === 1, "El permiso explícito debe permitir facturar")
  })
  await test("Propietario conserva autorización para vender sin existencia", async () => {
    const f = await setup([basic("pan", 0)], { owner: true })
    assert(!card("pan").disabled, "El dueño está autorizado")
    card("pan").click(); await sleep(20); await checkout()
    assert(f.saves === 1 && f.printed === 1, "Debe facturar normalmente")
  })
  rootView?.unmount()
  document.getElementById("result").textContent = JSON.stringify(results)
}

const mocks = {
  "sales-actions": `export async function listCustomers(){return [{id:'generic',name:'Consumidor final',isGeneric:true}]} export async function listAllProductsForSale(){return window.__fixture.snapshot()} export async function searchProducts(q){return window.__fixture.snapshot().filter(p=>p.name.includes(q)||p.sku===q)} export async function findProductByBarcode(q){return window.__fixture.snapshot().find(p=>p.sku===q)} export async function checkSaleStock(items){return window.__fixture.check(items)} export async function createSale(input){return window.__fixture.save(input.items,input.notes)}`,
  "payments-actions": `export async function addPayment(){} export async function addBatchPayment(){}`,
  "sync-actions": `export async function syncProductsToIndexedDB(){const f=window.__fixture;return f.syncProducts?f.syncProducts():f.snapshot()} export async function syncCustomersToIndexedDB(){return [{id:'generic',name:'Consumidor final',isGeneric:true}]} export async function syncARToIndexedDB(){return [{id:'ar'}]}`,
  "treasury-actions": `export async function listTreasuryAccounts(){return [{id:'cash',name:'Caja efectivo',type:'CAJA',bankName:null}]}`,
  "onboarding-actions": `export async function completeDemoCheckout(){}`,
  "navigation": `export const usePathname=()=>'/sales'; export const useRouter=()=>({push(){}})`,
  "link": `import React from 'react'; export default function Link(props){return React.createElement('a',props)}`,
  "gate": `export const useCashShiftAccess=()=>({allowed:true,ensureAccess:async()=>true,handleError:()=>false})`,
  "banner": `export const CashShiftBanner=()=>null`,
  "guide": `export const OnboardingGuide=()=>null`,
  "toast": `export const toast=value=>window.__fixture.toasts.push(value)`,
  "prisma": `export const SaleType={CONTADO:'CONTADO',CREDITO:'CREDITO'}; export const PaymentMethod={EFECTIVO:'EFECTIVO',TRANSFERENCIA:'TRANSFERENCIA',TARJETA:'TARJETA',DIVIDIR_PAGO:'DIVIDIR_PAGO'}; export const UnitType={UNIDAD:'UNIDAD',KG:'KG'}`,
}
const aliases = { "@/app/(app)/sync/actions": "sync-actions", "@/app/(app)/sales/actions": "sales-actions", "@/app/(app)/ar/actions": "payments-actions", "next/navigation": "navigation", "next/link": "link", "@/components/app/cash-shift-gate": "gate", "@/components/app/cash-shift-banner": "banner", "@/components/app/onboarding-guide": "guide", "@/hooks/use-toast": "toast", "@prisma/client": "prisma" }
const compiled = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PosClient} from './src/app/(app)/sales/pos-client'; import {getStockConsumptions,buildStockInventory,validateStockConsumptions} from './src/lib/pos-stock'; import {cashPending,syncCashOutbox,refreshCashContext} from './src/lib/cash-offline'; import {syncCacheData} from './src/lib/auto-sync'; import {getPendingSales} from './src/lib/indexed-db'; import {syncPendingData} from './src/lib/sync-manager'; (${browserSuite.toString()})().catch(e=>document.getElementById('result').textContent=JSON.stringify([{ok:false,error:e.stack}]));`, resolveDir: root },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "stock-test-server", setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      let key = aliases[args.path]
      if (args.importer.endsWith("pos-client.tsx")) key ??= { "./actions": "sales-actions", "../treasury/actions": "treasury-actions", "../onboarding/actions": "onboarding-actions" }[args.path]
      if (key) return { path: key, namespace: "stock-test" }
    })
    build.onLoad({ filter: /.*/, namespace: "stock-test" }, args => ({ contents: mocks[args.path], resolveDir: root }))
  } }],
})
await runBrowserSuite(root, "pos-stock-browser", `<!doctype html><meta charset="utf-8"><div id="test-root"></div><pre id="result">RUNNING</pre><script>window.__errors=[];window.addEventListener('error',e=>window.__errors.push(e.message));${compiled.outputFiles[0].text}</script>`)
