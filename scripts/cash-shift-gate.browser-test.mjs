// React, Radix, IndexedDB y Web Locks reales; red simulada y perfil de navegador desechable.
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build } from "esbuild"
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const browser = [process.env.CASH_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean).find(p => fs.existsSync(p))
if (!browser) throw new Error("Define CASH_TEST_BROWSER con Chrome o Edge")

async function browserSuite() {
  const results = []
  let online = true, currentRoot, serial = 0, childMounts = 0
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online })
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  function assert(ok, message) { if (!ok) throw new Error(message) }
  async function until(predicate, message) { for (let i = 0; i < 200; i++) { if (predicate()) return; await sleep(10) } throw new Error(message) }
  async function rejected(fn, message) { let failed = false; try { await fn() } catch { failed = true } assert(failed, message) }
  function button(label) { return [...document.querySelectorAll("button")].find(b => b.textContent === label) }
  async function input(id, text) {
    const element = document.getElementById(id)
    assert(element, `Falta campo ${id}`)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, text)
    element.dispatchEvent(new Event("input", { bubbles: true }))
    await sleep(20)
  }
  async function clearDatabase(name) {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    if (db.objectStoreNames.length) await new Promise((resolve, reject) => {
      const tx = db.transaction([...db.objectStoreNames], "readwrite")
      for (const name of db.objectStoreNames) tx.objectStore(name).clear()
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error)
    })
    db.close()
  }
  async function fixture() {
    currentRoot?.unmount(); await sleep(20); online = true
    await cashPending(); await getPendingCounts()
    await clearDatabase("movopos-cash-v1"); await clearDatabase("movopos-offline")
    const actor = { id: "ana", accountId: `gate-${++serial}` }
    const context = { protocolVersion: 1, accountId: actor.accountId, userId: actor.id, userName: "Ana", isOwner: true, enabled: true, ledgerStartedAt: new Date().toISOString(), canOperate: true, canViewAll: true, canManage: true, canTransfer: true, canRecordMovements: true, treasuryAccountId: "box", expectedOpeningCents: 11100, breakdown: [], activeShift: null }
    const f = { actor, context, openRequests: 0, createdShifts: 0, documents: [], getStatus: 200, networkError: false, delay: 0, dropOpen: false }
    f.shift = () => ({ id: `shift-${actor.accountId}`, status: "OPEN", cashierName: "Ana", isMine: true, isDevice: true, openedAt: new Date().toISOString(), lastSequence: 0, finalSequence: null, openingCountedCents: 11100, expectedCashCents: 11100 })
    window.fetch = async (_url, options = {}) => {
      if (!online || f.networkError) throw new TypeError("Network offline")
      if (!options.method) {
        if (f.delay) await sleep(f.delay)
        return new Response(JSON.stringify(f.getStatus === 200 ? context : { error: "Sesión vencida" }), { status: f.getStatus })
      }
      const body = JSON.parse(options.body)
      if (body.action === "open") {
        f.openRequests++
        if (context.activeShift) return new Response(JSON.stringify({ error: "Ya hay un turno abierto" }), { status: 409 })
        context.activeShift = { ...f.shift(), openingCountedCents: body.countedCents, expectedCashCents: body.countedCents }
        context.expectedOpeningCents = null; f.createdShifts++
        if (f.dropOpen) { f.dropOpen = false; if (f.loseRecovery) f.networkError = true; throw new TypeError("Lost open response after commit") }
        return new Response(JSON.stringify({ ok: true, data: { id: context.activeShift.id } }), { status: 200 })
      }
      f.documents.push(body)
      if (body.cashOperation.cashShiftId) context.activeShift.lastSequence = body.cashOperation.clientSequence
      return new Response(JSON.stringify({ result: { id: "document-1" } }), { status: 200 })
    }
    return f
  }
  function Editor({ actor }) {
    const access = useCashShiftAccess(), [prepared, setPrepared] = React.useState("")
    const [detailOpen, setDetailOpen] = React.useState(false), [detail, setDetail] = React.useState("")
    React.useEffect(() => { childMounts++ }, [])
    const save = async () => {
      if (!await access.ensureAccess()) return
      try { await submitControlledDocument("sale", { total: 100, prepared }, actor) }
      catch (error) { if (!access.handleError(error)) throw error }
    }
    return React.createElement("div", null,
      React.createElement("input", { id: "prepared", value: prepared, onChange: event => setPrepared(event.target.value) }),
      React.createElement("button", { id: "save", onClick: save }, "Registrar documento"),
      React.createElement("button", { id: "show-detail", onClick: () => setDetailOpen(true) }, "Preparar abono"),
      React.createElement(Dialog, { open: detailOpen && access.allowed, onOpenChange: setDetailOpen }, React.createElement(DialogContent, null, React.createElement(DialogTitle, null, "Abono preparado"), React.createElement(DialogDescription, null, "Datos del cobro"), React.createElement("input", { id: "detail", value: detail, onChange: event => setDetail(event.target.value) }))))
  }
  function mount(f, bypass = false) {
    currentRoot = createRoot(document.getElementById("test-root"))
    currentRoot.render(React.createElement(CashShiftGate, { actor: f.actor, bypass }, React.createElement(Editor, { actor: f.actor })))
  }
  const dialog = () => document.querySelector('[role="dialog"]')
  async function test(name, fn) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: error.message }) } }

  await test("Al entrar verifica la caja antes de montar el formulario y abre el aviso automáticamente", async () => {
    const f = await fixture(); f.delay = 80; const mounts = childMounts; mount(f)
    await sleep(20); assert(!document.getElementById("prepared"), "No debe mostrar formularios mientras verifica")
    await until(dialog, "Debe mostrar el diálogo al entrar")
    assert(childMounts === mounts, "El editor no debe montarse sin turno")
    assert(dialog().textContent.includes("Abre tu turno para comenzar"), "Debe indicar cómo comenzar")
  })
  await test("Cerrar la ventana mantiene el bloqueo y permite volver a abrirla", async () => {
    const f = await fixture(); mount(f); await until(dialog, "Debe abrir")
    button("Ahora no").click(); await until(() => !dialog(), "Debe cerrar el diálogo")
    assert(!document.getElementById("prepared"), "Cerrar no habilita el editor")
    button("Abrir o revisar mi turno").click(); await until(dialog, "Debe permitir reabrir")
    assert(f.documents.length === 0, "No registra documentos")
  })
  await test("Turnos desactivados permiten trabajar sin ventana", async () => {
    const f = await fixture(); f.context.enabled = false; mount(f)
    await until(() => document.getElementById("prepared"), "Debe habilitar el editor")
    assert(!dialog() && f.openRequests === 0, "No debe abrir turno")
  })
  await test("Turno propio abierto permite trabajar directamente", async () => {
    const f = await fixture(); f.context.activeShift = f.shift(); mount(f)
    await until(() => document.getElementById("prepared"), "Debe habilitar el editor")
    assert(!dialog(), "No debe pedir otra apertura")
  })
  await test("La práctica sin documentos reales queda excluida de la apertura", async () => {
    const f = await fixture(); mount(f, true)
    await until(() => document.getElementById("prepared"), "La práctica debe estar disponible")
    assert(!dialog() && f.openRequests === 0, "No debe abrir un turno para practicar")
  })
  await test("Abrir desde la ventana muestra el esperado y habilita sin registrar documentos", async () => {
    const f = await fixture(); mount(f); await until(dialog, "Debe abrir")
    assert(dialog().textContent.includes("111"), "Debe mostrar el efectivo esperado")
    await input("cash-gate-counted", "111.00")
    button("Abrir mi turno y comenzar").click()
    await until(() => document.getElementById("prepared"), "Debe habilitar después de abrir")
    assert(!dialog() && f.createdShifts === 1 && f.documents.length === 0, "Solo registra la apertura")
  })
  await test("Una diferencia exige motivo y conserva el conteo real", async () => {
    const f = await fixture(); mount(f); await until(dialog, "Debe abrir")
    await input("cash-gate-counted", "100.00")
    assert(button("Abrir mi turno y comenzar").disabled, "Debe exigir motivo")
    await input("cash-gate-note", "Se recibieron cien pesos")
    button("Abrir mi turno y comenzar").click()
    await until(() => document.getElementById("prepared"), "Debe abrir con motivo")
    assert(f.context.activeShift.openingCountedCents === 10000, "No debe reemplazar el conteo por el esperado")
  })
  await test("Otro empleado, otro dispositivo, cierre y falta de permiso no ofrecen una segunda apertura", async () => {
    for (const mode of ["other-user", "other-device", "closing", "permission"]) {
      const f = await fixture()
      if (mode === "permission") f.context.canOperate = false
      else { f.context.activeShift = f.shift(); if (mode === "other-user") f.context.activeShift.isMine = false; if (mode === "other-device") f.context.activeShift.isDevice = false; if (mode === "closing") f.context.activeShift.status = "CLOSING" }
      mount(f); await until(dialog, "Debe explicar el bloqueo")
      assert(!document.getElementById("prepared") && !button("Abrir mi turno y comenzar"), `No permite abrir para ${mode}`)
      assert(f.openRequests === 0, "No debe enviar apertura")
    }
  })
  await test("Sin conexión ni contexto previo pide conexión y mantiene los formularios bloqueados", async () => {
    const f = await fixture(); online = false; mount(f)
    await until(dialog, "Debe explicar que necesita conexión")
    assert(!document.getElementById("prepared") && f.openRequests === 0, "No debe operar sin información")
  })
  await test("Un turno propio verificado permite seguir offline y reconectar actualiza el bloqueo", async () => {
    const f = await fixture(); f.context.activeShift = f.shift(); await refreshCashContext(); online = false; mount(f)
    await until(() => document.getElementById("prepared"), "Debe permitir el turno offline")
    f.context.activeShift.status = "CLOSING"; online = true; window.dispatchEvent(new Event("online"))
    await until(dialog, "Debe detectar el cierre al reconectar")
    assert(document.getElementById("prepared").closest('[hidden]'), "Debe ocultar el editor")
  })
  await test("Una sesión rechazada no habilita el editor con el contexto cacheado", async () => {
    const f = await fixture(); f.context.activeShift = f.shift(); await refreshCashContext(); f.getStatus = 401; mount(f)
    await until(dialog, "Debe mostrar el rechazo")
    assert(!document.getElementById("prepared"), "No puede usar permisos cacheados tras un 401")
  })
  await test("El contexto de otro empleado no se reutiliza al entrar", async () => {
    const f = await fixture(); f.context.activeShift = f.shift(); f.context.userId = "luis"; mount(f)
    await until(dialog, "Debe explicar el cambio de empleado")
    assert(!document.getElementById("prepared") && !button("Abrir mi turno y comenzar"), "No permite operar como otro empleado")
  })
  await test("Sin conexión no permite abrir aunque conozca el saldo esperado", async () => {
    const f = await fixture(); await refreshCashContext(); online = false; mount(f)
    await until(dialog, "Debe mostrar la apertura pendiente")
    await input("cash-gate-counted", "111.00")
    assert(button("Abrir mi turno y comenzar").disabled && f.openRequests === 0, "Debe requerir conexión para abrir")
  })
  await test("Antes de guardar detecta cambios y conserva lo preparado sin registrar ni encolar", async () => {
    const f = await fixture(); f.context.activeShift = f.shift(); mount(f)
    await until(() => document.getElementById("prepared"), "Debe habilitar")
    await input("prepared", "Carrito conservado")
    f.context.activeShift = null
    document.getElementById("save").click(); await until(dialog, "Debe abrir el aviso antes de guardar")
    assert(f.documents.length === 0 && (await cashPending()).length === 0, "No debe guardar ni encolar")
    assert(document.getElementById("prepared").value === "Carrito conservado", "Debe conservar los datos")
    f.context.activeShift = f.shift(); window.dispatchEvent(new Event("focus"))
    await until(() => !dialog(), "Debe recuperar el acceso")
    assert(document.getElementById("prepared").value === "Carrito conservado" && f.documents.length === 0, "No debe guardar automáticamente al recuperar acceso")
  })
  await test("Recupera una respuesta de apertura perdida sin abrir dos turnos", async () => {
    const f = await fixture(); f.dropOpen = true; mount(f); await until(dialog, "Debe abrir")
    await input("cash-gate-counted", "111.00"); button("Abrir mi turno y comenzar").click()
    await until(() => document.getElementById("prepared"), "Debe recuperar la apertura confirmada")
    assert(f.createdShifts === 1 && f.openRequests === 1 && f.documents.length === 0, "No debe repetir la apertura ni crear documentos")
  })
  await test("Si tampoco se puede consultar la apertura, un reintento recupera el turno sin enviar otro POST", async () => {
    const f = await fixture(); f.dropOpen = true; f.loseRecovery = true; mount(f); await until(dialog, "Debe abrir")
    await input("cash-gate-counted", "111.00"); button("Abrir mi turno y comenzar").click()
    await until(() => document.querySelector('[role="alert"]')?.textContent.includes("confirmar la apertura"), "Debe explicar el resultado incierto")
    assert(!document.getElementById("prepared"), "No debe habilitar hasta confirmar")
    f.networkError = false; button("Abrir mi turno y comenzar").click()
    await until(() => document.getElementById("prepared"), "Debe recuperar al reintentar")
    assert(f.createdShifts === 1 && f.openRequests === 1 && f.documents.length === 0, "No debe enviar otra apertura")
  })
  await test("Un diálogo de cobro se oculta al bloquearse y conserva sus datos al recuperar el turno", async () => {
    const f = await fixture(); f.context.activeShift = f.shift(); mount(f)
    await until(() => document.getElementById("prepared"), "Debe habilitar")
    document.getElementById("show-detail").click(); await until(() => document.getElementById("detail"), "Debe abrir el cobro")
    await input("detail", "Monto conservado")
    f.context.activeShift.isMine = false; window.dispatchEvent(new Event("focus"))
    await until(() => dialog()?.textContent.includes("Revisa tu turno"), "Debe reemplazar el diálogo de cobro por el bloqueo")
    assert(!document.getElementById("detail"), "El cobro no puede quedar activo detrás del bloqueo")
    f.context.activeShift.isMine = true; window.dispatchEvent(new Event("focus"))
    await until(() => document.getElementById("detail"), "Debe recuperar el cobro preparado")
    assert(document.getElementById("detail").value === "Monto conservado" && f.documents.length === 0, "Debe conservar sin registrar automáticamente")
  })
  await test("Dos aperturas simultáneas recuperan el mismo turno", async () => {
    const f = await fixture()
    const [one, two] = await Promise.all([openCashShiftFromClient(f.actor, 11100, ""), openCashShiftFromClient(f.actor, 11100, "")])
    assert(f.createdShifts === 1 && one.activeShift.id === two.activeShift.id, "Debe conservar un solo turno")
  })
  await test("Las aperturas compartidas bloquean pendientes antiguos pero permiten pendientes bancarios sin turno", async () => {
    const f = await fixture(); await getPendingCounts()
    const db = await new Promise(resolve => { const req = indexedDB.open("movopos-offline"); req.onsuccess = () => resolve(req.result) })
    await new Promise(resolve => { const tx = db.transaction("pendingSales", "readwrite"); tx.objectStore("pendingSales").put({ tempId: "legacy-pending", createdAt: Date.now() }); tx.oncomplete = resolve })
    await rejected(() => openCashShiftFromClient(f.actor, 11100, ""), "Debe exigir sincronización legacy")
    assert(f.openRequests === 0, "No debe enviar una apertura con pendientes antiguos")
    db.close(); await clearDatabase("movopos-offline")
    const cashDb = await new Promise(resolve => { const req = indexedDB.open("movopos-cash-v1"); req.onsuccess = () => resolve(req.result) })
    await new Promise(resolve => { const tx = cashDb.transaction("outbox", "readwrite"); tx.objectStore("outbox").put({ id: "old-shift", cashOperation: { cashShiftId: "old" } }); tx.oncomplete = resolve })
    await rejected(() => openCashShiftFromClient(f.actor, 11100, ""), "Debe bloquear pendientes de otro turno")
    await clearDatabase("movopos-cash-v1")
    await new Promise(resolve => { const tx = cashDb.transaction("outbox", "readwrite"); tx.objectStore("outbox").put({ id: "bank", cashOperation: { cashShiftId: null } }); tx.oncomplete = resolve })
    await openCashShiftFromClient(f.actor, 11100, "")
    assert(f.createdShifts === 1, "Un pendiente bancario sin turno no bloquea la apertura")
    cashDb.close()
  })
  await test("Facturas al contado, crédito, pagos divididos y abonos individuales o múltiples exigen turno", async () => {
    const f = await fixture()
    for (const [kind, payload] of [["sale", { type: "CONTADO" }], ["sale", { type: "CREDITO" }], ["sale", { paymentMethod: "DIVIDIR_PAGO" }], ["payment", { method: "TRANSFERENCIA" }], ["batchPayment", { method: "TARJETA" }]]) {
      await rejected(() => submitControlledDocument(kind, payload, f.actor), `Debe bloquear ${kind}`)
    }
    assert(f.documents.length === 0 && (await cashPending()).length === 0, "No debe crear pendientes sin turno")
  })
  currentRoot?.unmount()
  document.getElementById("result").textContent = JSON.stringify(results)
}

const compiled = await build({ stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { CashShiftGate, useCashShiftAccess } from "./src/components/app/cash-shift-gate"; import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./src/components/ui/dialog"; import { cashPending, refreshCashContext, submitControlledDocument } from "./src/lib/cash-offline"; import { openCashShiftFromClient } from "./src/lib/cash-shift-opening"; import { getPendingCounts } from "./src/lib/indexed-db"; (${browserSuite.toString()})().catch(error => document.getElementById("result").textContent = JSON.stringify([{ok:false,error:error.message}]));`, resolveDir: rootDir }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "test-navigation", setup(build) { build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "test" })); build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: 'import React from "react"; export default function Link(props) { return React.createElement("a", props); }', resolveDir: rootDir })) } }] })
const target = path.join(rootDir, "tmp", "cash-gate-browser.html")
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `<!doctype html><meta charset="utf-8"><div id="test-root"></div><pre id="result">RUNNING</pre><script>${compiled.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>`)
const profile = path.join(rootDir, "tmp", `cash-gate-profile-${Date.now()}`)
const child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions", "--disable-background-networking", "--disable-component-update", "--disable-sync", `--user-data-dir=${profile}`, "--allow-file-access-from-files", "--remote-debugging-port=0", "about:blank"], { windowsHide: true, stdio: "ignore" })
let startupError
child.on("error", error => { startupError = error })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const portFile = path.join(profile, "DevToolsActivePort")
for (let i = 0; i < 150 && !fs.existsSync(portFile) && !startupError; i++) await wait(100)
if (startupError) throw startupError
if (!fs.existsSync(portFile)) throw new Error("Chrome no inició la instancia temporal")
const [port, socketPath] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/)
const socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let nextId = 0
const calls = new Map()
socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { const pending = calls.get(message.id); calls.delete(message.id); if (message.error) pending?.reject(new Error(message.error.message)); else pending?.resolve(message.result) } }
const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++nextId; calls.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
let results
try {
  const { targetId } = await call("Target.createTarget", { url: pathToFileURL(target).href })
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true })
  for (let i = 0; i < 600; i++) {
    const state = await call("Runtime.evaluate", { expression: 'document.getElementById("result")?.textContent', returnByValue: true }, sessionId)
    if (state.result?.value && state.result.value !== "RUNNING") { results = JSON.parse(state.result.value); break }
    await wait(100)
  }
  if (!results) throw new Error("El navegador no terminó las pruebas de apertura")
} finally { await call("Browser.close").catch(() => {}); socket.close() }
for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name ?? "Navegador"}${result.error ? ": " + result.error : ""}`)
if (results.some(result => !result.ok)) process.exitCode = 1
