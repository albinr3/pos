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
  // Consultar el componente, no body.textContent: el script inline también contiene los textos de las pruebas.
  function screenText() { return document.getElementById("test-root").textContent ?? "" }
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
    context.collectionsByMethod = [{ method: "EFECTIVO", totalCents: 22200 }, { method: "TARJETA", totalCents: 7500 }, { method: "TRANSFERENCIA", totalCents: 18800 }]
    const f = { actor, context, history: [], report: null, openRequests: 0, createdShifts: 0, documents: [], actions: [], getStatus: 200, networkError: false, delay: 0, dropOpen: false, failOperations: false }
    f.shift = () => ({ id: `shift-${actor.accountId}`, status: "OPEN", cashierName: "Ana", isMine: true, isDevice: true, openedAt: new Date().toISOString(), lastSequence: 0, finalSequence: null, openingCountedCents: 11100, expectedCashCents: 11100 })
    window.fetch = async (url, options = {}) => {
      if (!online || f.networkError) throw new TypeError("Network offline")
      if (!options.method) {
        if (f.delay) await sleep(f.delay)
        if (url.includes("view=report")) return new Response(JSON.stringify(f.report ?? { error: "Sin reporte" }), { status: f.report ? 200 : 404 })
        const data = url.includes("view=history") ? f.history : url.includes("/treasury/accounts") ? { data: [{ id: "box", name: "Caja Efectivo" }, { id: "bank", name: "Banco" }] } : context
        return new Response(JSON.stringify(f.getStatus === 200 ? data : { error: "Sesión vencida" }), { status: f.getStatus })
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
      if (body.action) {
        f.actions.push(body)
        if (body.action === "prepare") { context.activeShift.status = "CLOSING"; context.activeShift.finalSequence = body.finalSequence }
        if (body.action === "resume") { context.activeShift.status = "OPEN"; context.activeShift.finalSequence = null }
        if (body.action === "close" || body.action === "emergency") { context.activeShift = null; context.expectedOpeningCents = body.countedCents }
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (f.failOperations) return new Response(JSON.stringify({ error: "No se pudo confirmar la venta" }), { status: 400 })
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
  function mountWorkspace(f) {
    f.context.activeShift = { ...f.shift(), openingCountedCents: 11100, expectedCashCents: 33300 }
    f.context.expectedOpeningCents = null
    f.context.breakdown = [{ accountName: "Caja Efectivo", method: "EFECTIVO", totalCents: 22200 }]
    currentRoot = createRoot(document.getElementById("test-root"))
    currentRoot.render(React.createElement(CashShiftsClient))
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
  await test("La caja abierta muestra un resumen y no un faltante antes de contar", async () => {
    const f = await fixture(); mountWorkspace(f)
    await until(() => button("Cerrar mi turno"), "Debe mostrar el turno abierto")
    assert(screenText().includes("333") && screenText().includes("111") && screenText().includes("222"), "Debe distinguir efectivo esperado, recibido y movimiento")
    assert(!document.getElementById("cash-shift-counted") && !screenText().includes("Faltan"), "No debe mostrar un conteo ni una diferencia falsa mientras trabaja")
    assert(f.actions.length === 0, "Consultar no debe iniciar el cierre")
  })
  await test("Al cerrar centra y destaca el panel durante un segundo, también al volver a intentarlo", async () => {
    const originalScroll = Element.prototype.scrollIntoView
    const calls = []
    Element.prototype.scrollIntoView = function (options) { calls.push({ element: this, options }) }
    try {
      const f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar el turno")
      button("Cerrar mi turno").click()
      await until(() => document.querySelector('[aria-label="Cierre del turno"].cash-shift-closing-highlight'), "Debe destacar la sección nueva")
      const section = document.querySelector('[aria-label="Cierre del turno"]')
      assert(calls.length === 1 && calls[0].element === section && calls[0].options.block === "center" && calls[0].options.behavior === "smooth", "Debe desplazar suavemente al centro del cierre")
      await sleep(1400)
      assert(!section.classList.contains("cash-shift-closing-highlight"), "El borde debe desaparecer tras el destello")
      await until(() => button("Actualizar") && !button("Actualizar").disabled, "Debe terminar de preparar")
      button("Actualizar").click(); await sleep(200); await until(() => button("Actualizar") && !button("Actualizar").disabled, "Debe terminar de actualizar")
      assert(calls.length === 1, "Actualizar no debe desplazar otra vez")
      await until(() => button("Volver al turno y seguir trabajando") && !button("Volver al turno y seguir trabajando").disabled, "Debe permitir reanudar")
      button("Volver al turno y seguir trabajando").click(); await until(() => button("Cerrar mi turno") && !button("Cerrar mi turno").disabled, "Debe regresar al turno")
      button("Cerrar mi turno").click(); await until(() => calls.length === 2, "Al iniciar otro cierre debe repetir la guía")
    } finally { Element.prototype.scrollIntoView = originalScroll }
  })
  await test("Movimiento reducido evita desplazamiento animado y cargar un cierre existente no mueve la pantalla", async () => {
    const originalScroll = Element.prototype.scrollIntoView, originalMatchMedia = window.matchMedia
    const calls = []
    Element.prototype.scrollIntoView = function (options) { calls.push(options) }
    window.matchMedia = query => query === "(prefers-reduced-motion: reduce)" ? { matches: true } : originalMatchMedia.call(window, query)
    try {
      let f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar el turno")
      button("Cerrar mi turno").click(); await until(() => document.querySelector('[aria-label="Cierre del turno"].cash-shift-closing-highlight'), "Debe destacar el cierre")
      assert(calls.length === 1 && calls[0].block === "center" && calls[0].behavior === "instant", "Debe centrar sin movimiento animado")
      await sleep(1100)
      assert(!document.querySelector('[aria-label="Cierre del turno"]').classList.contains("cash-shift-closing-highlight"), "El borde fijo debe retirarse después de un segundo")
      f = await fixture(); mountWorkspace(f); f.context.activeShift.status = "CLOSING"; f.context.activeShift.finalSequence = 0
      await until(() => button("Confirmar cierre y entregar caja"), "Debe cargar el cierre existente")
      await sleep(50)
      assert(calls.length === 1 && !document.querySelector('[aria-label="Cierre del turno"]').classList.contains("cash-shift-closing-highlight"), "Entrar a un cierre existente no debe desplazar sin un clic")
    } finally { Element.prototype.scrollIntoView = originalScroll; window.matchMedia = originalMatchMedia }
  })
  await test("Todos los cobros son visibles sin desplegar el detalle ni mezclarse con el fondo", async () => {
    const f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
    const summary = document.querySelector('[aria-label="Cobros del turno"]')
    assert(summary && !summary.closest("details"), "Los cobros deben estar visibles")
    assert([...summary.querySelectorAll("dt")].map(e => e.textContent).join(",") === "Efectivo,Tarjeta,Transferencia", "Mismos métodos y jerarquía")
    assert(summary.textContent.includes("485.00") && summary.textContent.includes("222.00") && summary.textContent.includes("75.00") && summary.textContent.includes("188.00"), "Total cobrado y métodos, sin incluir el fondo")
    assert(document.querySelector('[aria-label="Efectivo para entregar"]').textContent.includes("333.00"), "El efectivo esperado se muestra aparte")
    button("Cerrar mi turno").click(); await until(() => button("Confirmar cierre y entregar caja"), "Debe preparar")
    assert(document.querySelector('[aria-label="Cobros del turno"]').textContent.includes("485.00") && screenText().includes("Revisa cobros y cuenta efectivo"), "El resumen permanece al cerrar sin otro paso obligatorio")
  })
  await test("Un contexto antiguo pide actualizar y no inventa importes de tarjeta o transferencia", async () => {
    const f = await fixture(); delete f.context.collectionsByMethod; mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
    const summary = document.querySelector('[aria-label="Cobros del turno"]')
    assert(summary.textContent.includes("Actualiza el turno") && !summary.querySelector("dd"), "Mostrar ausencia de datos, no ceros falsos")
  })
  await test("El comprobante del historial usa los mismos métodos y distingue la diferencia de efectivo", async () => {
    const f = await fixture()
    f.history = [{ id: "closed-summary", cashierName: "Histórico", status: "CLOSED", openedAt: new Date().toISOString(), closedAt: new Date().toISOString(), openingCountedCents: 11100, openingDifferenceCents: 0, expectedClosingCents: 33300, countedClosingCents: 33300, closingDifferenceCents: 0, closingSnapshot: { emergency: false, documents: [], movements: f.context.collectionsByMethod.map((item, index) => ({ id: String(index), sourceType: "sale", reference: "Venta", method: item.method, amountCents: item.totalCents })) } }]
    mountWorkspace(f); await until(() => [...document.querySelectorAll("button")].some(b => b.textContent.includes("Histórico")), "Debe cargar historial")
    ;[...document.querySelectorAll("button")].find(b => b.textContent.includes("Histórico")).click()
    await until(() => document.querySelectorAll('[aria-label="Cobros del turno"]').length === 2, "Debe mostrar el resumen guardado")
    assert([...document.querySelectorAll('[aria-label="Cobros del turno"]')].every(s => s.textContent.includes("485.00")), "Mismo total en turno y comprobante")
    assert(screenText().includes("Efectivo contado") && screenText().includes("Diferencia de efectivo del turno"), "Etiquetar el conteo y la diferencia como efectivo")
  })
  await test("Cerrar guía el conteo, exige introducirlo y guarda el comprobante al coincidir", async () => {
    const f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
    button("Cerrar mi turno").click(); await until(() => button("Confirmar cierre y entregar caja"), "Debe mostrar el conteo tras preparar")
    assert(f.actions[0].action === "prepare", "Debe preparar el cierre antes de contar")
    assert(button("Confirmar cierre y entregar caja").disabled && !screenText().includes("Faltan"), "No interpretar el cero inicial como conteo")
    await input("cash-shift-counted", "333.00")
    assert(screenText().includes("El efectivo cuadra") && !document.getElementById("cash-count-note"), "Explicar la coincidencia del efectivo sin pedir motivo")
    button("Confirmar cierre y entregar caja").click(); await until(() => screenText().includes("El turno quedó cerrado"), "Debe confirmar el cierre")
    assert(f.actions.at(-1).countedCents === 33300 && document.querySelector('a[href^="/receipts/cash-shift/"]'), "Guardar el conteo y ofrecer comprobante")
  })
  await test("Imprimir el detalle agrupa movimientos y usa el formato del negocio", async () => {
    const originalOpen = window.open, frame = document.createElement("iframe")
    document.body.appendChild(frame); const popup = frame.contentWindow; let printed = 0
    popup.print = () => { printed++ }; popup.focus = () => {}; window.open = () => popup
    try {
      const f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
      f.report = { accountId: f.actor.accountId, userId: f.actor.id, shiftId: f.context.activeShift.id, cashierName: "Ana", openedAt: new Date().toISOString(), generatedAt: new Date().toISOString(), companyName: "Negocio", format: "80mm", openingCents: 11100, expectedCashCents: 33300, lastSequence: 0, finalSequence: 0, status: "CLOSING", confirmedOperationIds: [], documents: [], movements: [{ id: "one", sourceType: "sale", sourceId: "sale", reference: "FAC-1", method: "TARJETA", amountCents: 7500, recordedAt: new Date().toISOString(), note: null, treasuryAccount: { name: "Banco" } }] }
      button("Cerrar mi turno").click(); await until(() => button("Ver detalle del turno"), "Debe mostrar el botón en el cierre")
      button("Ver detalle del turno").click(); await until(() => printed === 1, "Debe abrir la impresión")
      assert(popup.document.body.textContent.includes("FAC-1") && popup.document.body.textContent.includes("Tarjeta") && popup.document.body.textContent.includes("75.00"), "Debe imprimir los movimientos por método")
      assert(popup.document.head.textContent.includes("80mm auto"), "Debe usar el formato configurado")
      assert(f.context.activeShift.status === "CLOSING" && !f.actions.some(action => action.action === "close"), "Imprimir no debe cerrar el turno")
    } finally { window.open = originalOpen; frame.remove() }
  })
  await test("Sin conexión se abre el detalle provisional sin iniciar el cierre", async () => {
    const originalOpen = window.open, frame = document.createElement("iframe")
    document.body.appendChild(frame); const popup = frame.contentWindow; let printed = 0
    popup.print = () => { printed++ }; popup.focus = () => {}; window.open = () => popup
    try {
      const f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
      online = false; button("Cerrar mi turno").click()
      await until(() => button("Ver detalle del turno"), "Debe permitir abrir el detalle sin conexión")
      assert(screenText().includes("Detalle provisional sin conexión") && button("Confirmar cierre y entregar caja").disabled && f.context.activeShift.status === "OPEN", "No debe cerrar ni bloquear ventas")
      button("Ver detalle del turno").click(); await until(() => printed === 1, "Debe imprimir sin conexión")
      assert(popup.document.body.textContent.includes("REPORTE PROVISIONAL O INCOMPLETO") && popup.document.body.textContent.includes("No hay una copia previa"), "Debe aclarar la falta de datos confirmados")
      assert(popup.document.head.textContent.includes("size: A4"), "A4 debe ser el formato inicial")
      assert(!f.actions.some(action => action.action === "prepare" || action.action === "close"), "No debe registrar un cierre provisional en el servidor")
    } finally { online = true; window.open = originalOpen; frame.remove() }
  })
  await test("Desde ventas o cobros se puede imprimir el detalle propio sin conexión", async () => {
    const originalOpen = window.open, frame = document.createElement("iframe")
    document.body.appendChild(frame); const popup = frame.contentWindow; let printed = 0
    popup.print = () => { printed++ }; popup.focus = () => {}; window.open = () => popup
    try {
      const f = await fixture(); f.context.activeShift = f.shift(); await refreshCashContext()
      online = false; currentRoot = createRoot(document.getElementById("test-root")); currentRoot.render(React.createElement(CashShiftBanner, { actor: f.actor }))
      await until(() => button("Ver detalle del turno"), "El aviso de caja debe permitir imprimir sin navegar")
      button("Ver detalle del turno").click(); await until(() => printed === 1, "Debe imprimir sin conexión")
      assert(popup.document.body.textContent.includes("REPORTE PROVISIONAL O INCOMPLETO"), "El reporte debe identificarse como provisional")
      assert(f.actions.length === 0, "Consultar no debe cambiar el turno")
    } finally { online = true; window.open = originalOpen; frame.remove() }
  })
  await test("Si el navegador bloquea la impresión se muestra una indicación", async () => {
    const originalOpen = window.open; window.open = () => null
    try {
      const f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
      button("Cerrar mi turno").click(); await until(() => button("Ver detalle del turno"), "Debe ofrecer el detalle")
      button("Ver detalle del turno").click(); await until(() => screenText().includes("El navegador bloqueó la ventana de impresión"), "Debe explicar cómo habilitar la impresión")
    } finally { window.open = originalOpen }
  })
  await test("El faltante se expresa en palabras y requiere motivo antes de cerrar", async () => {
    const f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
    button("Cerrar mi turno").click(); await until(() => document.getElementById("cash-shift-counted"), "Debe contar")
    await input("cash-shift-counted", "321.00")
    assert(screenText().includes("Faltan") && screenText().includes("12.00") && button("Confirmar cierre y entregar caja").disabled, "Debe explicar el faltante y pedir motivo")
    await input("cash-count-note", "Se recibieron doce pesos menos")
    assert(!button("Confirmar cierre y entregar caja").disabled, "El motivo permite confirmar")
    button("Confirmar cierre y entregar caja").click(); await until(() => f.actions.some(a => a.action === "close"), "Debe enviar cierre")
    assert(f.actions.at(-1).countedCents === 32100 && f.actions.at(-1).note === "Se recibieron doce pesos menos", "Conservar conteo y motivo")
  })
  await test("Preparar con un pendiente rechazado refresca el estado real y permite reenviar antes de cerrar", async () => {
    const f = await fixture(); f.context.activeShift = f.shift(); await refreshCashContext(); online = false
    await submitControlledDocument("sale", { total: 100 }, f.actor)
    online = true; f.failOperations = true; mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
    button("Cerrar mi turno").click(); await until(() => screenText().includes("Falta 1 operación por enviar") && button("Confirmar cierre y entregar caja"), "Debe mostrar CLOSING y el pendiente incluso tras el error")
    await input("cash-shift-counted", "333.00")
    assert(button("Confirmar cierre y entregar caja").disabled && f.context.activeShift.status === "CLOSING", "No permitir cerrar con pendientes")
    f.failOperations = false; await until(() => button("Enviar pendientes") && !button("Enviar pendientes").disabled, "Debe permitir reenviar")
    button("Enviar pendientes").click()
    await until(() => button("Confirmar cierre y entregar caja") && !button("Confirmar cierre y entregar caja").disabled, "Debe permitir cerrar cuando se confirma la secuencia")
    assert(f.documents.length === 1 && (await cashPending()).length === 0, "Confirmar una sola venta")
  })
  await test("Volver a trabajar cancela la preparación y oculta el conteo", async () => {
    const f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
    button("Cerrar mi turno").click(); await until(() => button("Confirmar cierre y entregar caja"), "Debe preparar")
    await input("cash-shift-counted", "300.00")
    button("Volver al turno y seguir trabajando").click(); await until(() => button("Cerrar mi turno"), "Debe recuperar el turno abierto")
    assert(!document.getElementById("cash-shift-counted") && f.actions.at(-1).action === "resume" && f.context.activeShift.expectedCashCents === 33300, "Reanudar no cambia dinero ni guarda el conteo provisional")
  })
  await test("Un conteo de cero válido requiere introducirse explícitamente", async () => {
    const f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar")
    f.context.activeShift.expectedCashCents = 0
    button("Cerrar mi turno").click(); await until(() => button("Confirmar cierre y entregar caja"), "Debe preparar")
    assert(button("Confirmar cierre y entregar caja").disabled, "El cero por defecto no confirma una caja vacía")
    await input("cash-shift-counted", "0")
    assert(!button("Confirmar cierre y entregar caja").disabled && screenText().includes("El efectivo cuadra"), "Debe admitir una caja realmente vacía")
  })
  await test("Otra persona sin acceso a saldos no recibe controles de cierre ni importes inventados", async () => {
    const f = await fixture(); mountWorkspace(f)
    f.context.activeShift.isMine = false; f.context.activeShift.openingCountedCents = null; f.context.activeShift.expectedCashCents = null
    f.context.isOwner = false; f.context.canManage = false; f.context.canViewAll = false; f.context.breakdown = []
    await until(() => screenText().includes("Debe cerrarlo y entregar"), "Debe explicar quién tiene la caja")
    assert(!button("Cerrar mi turno") && !document.getElementById("cash-shift-counted") && !screenText().includes("Lo que debe haber"), "No mostrar controles ni saldos sin permiso")
  })
  await test("El aviso usa el cambio de día UTC-4 y no una duración de 24 horas", async () => {
    const before = new Date("2026-11-01T03:59:59Z"), after = new Date("2026-11-01T04:00:00Z")
    assert(!isBeforeCurrentBusinessDay("2026-11-01T03:30:00Z", before), "Antes de medianoche sigue siendo el mismo día del negocio")
    assert(isBeforeCurrentBusinessDay("2026-11-01T03:59:59Z", after), "El día cambia a las 04:00 UTC")
    assert(!isBeforeCurrentBusinessDay("2026-11-01T04:00:00Z", after), "Una apertura a medianoche pertenece al nuevo día")
    assert(!isBeforeCurrentBusinessDay("fecha inválida", after), "Una fecha inválida no debe generar el aviso")
  })
  await test("Un turno de hoy no muestra advertencia; uno anterior informa que sigue abierto", async () => {
    let f = await fixture(); mountWorkspace(f); await until(() => button("Cerrar mi turno"), "Debe cargar el turno")
    await sleep(40); assert(!screenText().includes("Este turno comenzó un día anterior"), "No debe advertir sobre un turno de hoy")
    f = await fixture(); mountWorkspace(f); f.context.activeShift.openedAt = new Date(Date.now() - 86400000).toISOString()
    await until(() => screenText().includes("Este turno comenzó un día anterior"), "Debe avisar del turno anterior")
    assert(screenText().includes("sigue abierto") && screenText().includes("pueden continuar durante la noche") && button("Cerrar mi turno"), "Debe ser informativo y permitir el cierre normal")
  })
  await test("Actualizar con un turno de hoy retira el aviso del turno anterior", async () => {
    const f = await fixture(); mountWorkspace(f); f.context.activeShift.openedAt = new Date(Date.now() - 86400000).toISOString()
    await until(() => screenText().includes("Este turno comenzó un día anterior"), "Debe mostrar el aviso inicial")
    f.context.activeShift.openedAt = new Date().toISOString()
    button("Actualizar").click()
    await until(() => !screenText().includes("Este turno comenzó un día anterior"), "No debe conservar un aviso que ya no corresponde")
  })
  await test("El aviso aparece al cruzar medianoche sin recargar ni cerrar el turno", async () => {
    const RealDate = Date
    let now = RealDate.parse("2026-11-01T03:59:59.950Z")
    class FakeDate extends RealDate { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
    globalThis.Date = FakeDate
    try {
      const f = await fixture(); mountWorkspace(f); f.context.activeShift.openedAt = "2026-11-01T03:00:00Z"
      await until(() => button("Cerrar mi turno"), "Debe cargar el turno")
      await sleep(30); assert(!screenText().includes("Este turno comenzó un día anterior"), "No debe aparecer antes del cambio de día")
      now = RealDate.parse("2026-11-01T04:00:01Z")
      await until(() => screenText().includes("Este turno comenzó un día anterior"), "Debe actualizarse sin recargar")
      assert(f.context.activeShift.status === "OPEN" && f.actions.length === 0, "El aviso no debe modificar ni cerrar el turno")
    } finally { currentRoot?.unmount(); currentRoot = undefined; globalThis.Date = RealDate }
  })
  await test("El aviso distingue un cierre en preparación y aparece al bloquear a otro empleado", async () => {
    let f = await fixture(); mountWorkspace(f); f.context.activeShift.openedAt = new Date(Date.now() - 86400000).toISOString(); f.context.activeShift.status = "CLOSING"; f.context.activeShift.finalSequence = 0
    await until(() => screenText().includes("sigue en proceso de cierre"), "Debe indicar que el cierre está en preparación")
    f = await fixture(); f.context.activeShift = { ...f.shift(), isMine: false, cashierName: "Carlos", openedAt: new Date(Date.now() - 86400000).toISOString() }; mount(f)
    await until(() => dialog()?.textContent.includes("Este turno comenzó un día anterior"), "El empleado siguiente debe ver el aviso")
    assert(!button("Abrir mi turno y comenzar") && f.openRequests === 0, "El aviso no autoriza un segundo turno")
  })
  await test("El dueño puede contar y justificar un cierre excepcional desde Opciones del dueño", async () => {
    const f = await fixture(); mountWorkspace(f); f.context.activeShift.isMine = false; f.context.activeShift.cashierName = "Carlos"
    await until(() => screenText().includes("Opciones del dueño"), "Debe mostrar las opciones del dueño")
    const section = [...document.querySelectorAll("summary")].find(item => item.textContent === "Opciones del dueño")
    section.click(); await until(() => section.parentElement.open, "Debe desplegar la opción")
    await input("cash-shift-counted", "333.00")
    assert(button("Confirmar cierre excepcional").disabled, "Incluso si cuadra, debe indicar el motivo")
    await input("cash-count-note", "El responsable no está disponible y se revisarán sus pendientes")
    button("Confirmar cierre excepcional").click(); await until(() => screenText().includes("El turno quedó cerrado"), "Debe mostrar el cierre confirmado")
    const action = f.actions.find(item => item.action === "emergency")
    assert(action?.countedCents === 33300 && action.expectedCents === 33300 && action.note.includes("responsable"), "Debe enviar conteo, esperado y motivo")
  })
  currentRoot?.unmount()
  document.getElementById("result").textContent = JSON.stringify(results)
}

const compiled = await build({ stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { CashShiftGate, useCashShiftAccess } from "./src/components/app/cash-shift-gate"; import { CashShiftBanner } from "./src/components/app/cash-shift-banner"; import { CashShiftsClient } from "./src/app/(app)/daily-close/cash-shifts-client"; import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./src/components/ui/dialog"; import { cashPending, refreshCashContext, submitControlledDocument } from "./src/lib/cash-offline"; import { openCashShiftFromClient } from "./src/lib/cash-shift-opening"; import { isBeforeCurrentBusinessDay } from "./src/lib/dates"; import { getPendingCounts } from "./src/lib/indexed-db"; (${browserSuite.toString()})().catch(error => document.getElementById("result").textContent = JSON.stringify([{ok:false,error:error.message}]));`, resolveDir: rootDir }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "test-navigation", setup(build) { build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "test" })); build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: 'import React from "react"; export default function Link(props) { return React.createElement("a", props); }', resolveDir: rootDir })) } }] })
const target = path.join(rootDir, "tmp", "cash-gate-browser.html")
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `<!doctype html><meta charset="utf-8"><div id="test-root"></div><pre id="result">RUNNING</pre><script>${compiled.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>`)
const profile = path.join(rootDir, "tmp", `cash-gate-profile-${Date.now()}`)
const child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions", "--disable-background-networking", "--disable-component-update", "--disable-sync", `--user-data-dir=${profile}`, "--allow-file-access-from-files", "--remote-debugging-port=0", "about:blank"], { windowsHide: true, stdio: "ignore" })
let startupError
child.on("error", error => { startupError = error })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const portFile = path.join(profile, "DevToolsActivePort")
let connection
for (let i = 0; i < 150 && !startupError; i++) {
  // Chrome puede crear el archivo antes de terminar de escribirlo o liberar su bloqueo en Windows.
  try { const lines = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/); if (lines[0] && lines[1]) { connection = lines; break } }
  catch (error) { if (!["ENOENT", "EBUSY"].includes(error.code)) throw error }
  await wait(100)
}
if (startupError) throw startupError
if (!connection) throw new Error("Chrome no inició la instancia temporal")
const [port, socketPath] = connection
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
