// Ejecuta el módulo real con IndexedDB y Web Locks reales en un perfil de navegador desechable.
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import ts from "typescript"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const candidates = [process.env.CASH_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean)
const browser = candidates.find(p => fs.existsSync(p))
if (!browser) throw new Error("Define CASH_TEST_BROWSER con Chrome o Edge para estas pruebas")
const source = ts.transpileModule(fs.readFileSync(path.join(root, "src/lib/cash-offline.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const stockStateSource = ts.transpileModule(fs.readFileSync(path.join(root, "src/lib/stock-cache-state.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
async function browserSuite(compiled, stockCompiled) {
  const stockState = {}; new Function("exports", stockCompiled)(stockState)
  const results = []
  let caseId = 0, online = true
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online })
  function assert(condition, text) { if (!condition) throw new Error(text) }
  async function rejects(fn, text) { let failed = false; try { await fn() } catch { failed = true } assert(failed, text) }
  async function test(name, fn) { try { online = true; await fn(); results.push({ name, ok: true }) } catch (e) { results.push({ name, ok: false, error: e.message }) } }
  function fixture(enabled = true) {
    const unique = "cash-browser-" + Date.now() + "-" + (++caseId)
    const exports = {}; new Function("exports", "require", compiled.replace('"movopos-cash-v1"', JSON.stringify(unique)))(exports, name => { if (name === "./stock-cache-state") return stockState; throw new Error(name) })
    const context = { protocolVersion: 1, enabled, fiscalQueuePolicy: { version: 0, enabled: false }, accountId: unique, userId: "ana", userName: "Ana", canOperate: true, canManage: true, canViewAll: true, canTransfer: true, treasuryAccountId: "box", activeShift: { id: unique, isMine: true, isDevice: true, status: "OPEN", lastSequence: 0, finalSequence: null } }
    let processed = 0, drop = false, validation = false, manualError = null, report = null
    const seen = new Map(), manualSeen = new Map()
    window.fetch = async (url, options = {}) => {
      if (!online) throw new TypeError("Network offline")
      if (!options.method) {
        if (url.includes("view=report") && report === "unauthorized") return new Response("Sesión vencida", { status: 401 })
        if (url.includes("view=report")) return new Response(JSON.stringify(report ?? { error: "Sin reporte" }), { status: report ? 200 : 404 })
        return new Response(JSON.stringify(context), { status: 200 })
      }
      const body = JSON.parse(options.body)
      if (body.action === "movement") {
        if (manualError?.code) { const error = manualError; manualError = null; return new Response(JSON.stringify(error), { status: error.status }) }
        if (!manualSeen.has(body.operationId)) manualSeen.set(body.operationId, body)
        if (drop) { drop = false; throw new TypeError("Response lost after commit") }
        if (manualError) { const error = manualError; manualError = null; return new Response(JSON.stringify(error), { status: error.status }) }
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      const op = body.cashOperation
      if (validation && body.kind !== "discard") return new Response(JSON.stringify({ error: "Revisa el producto" }), { status: 400 })
      if (!seen.has(op.clientOperationId)) {
        if (op.cashShiftId !== null && op.clientSequence !== context.activeShift.lastSequence + 1) return new Response(JSON.stringify({ error: "Sequence gap" }), { status: 409 })
        processed++; if (op.cashShiftId !== null) context.activeShift.lastSequence++
        seen.set(op.clientOperationId, { invoiceCode: "A-" + processed, discarded: body.kind === "discard" })
      }
      if (drop) { drop = false; throw new TypeError("Response lost after commit") }
      return new Response(JSON.stringify({ result: seen.get(op.clientOperationId) }), { status: 200 })
    }
    return { api: exports, context, seen, manualSeen, setReport: value => { report = value }, setDrop: () => { drop = true }, setValidation: value => { validation = value }, setManualError: (status, code) => { manualError = { status, code, error: "Error de prueba" } } }
  }
  const reportFor = (f, ids = []) => ({ accountId: f.context.accountId, userId: f.context.userId, shiftId: f.context.activeShift.id, cashierName: "Ana", openedAt: new Date().toISOString(), generatedAt: new Date().toISOString(), companyName: "Negocio", format: "CARTA", openingCents: 10000, expectedCashCents: 10000, lastSequence: f.context.activeShift.lastSequence, finalSequence: null, status: "OPEN", confirmedOperationIds: ids, movements: [], documents: [] })
  await test("La cola conserva la versión fiscal del contexto y rechaza una copia antigua", async () => {
    const f = fixture(); f.context.fiscalQueuePolicy.version = 7; await f.api.refreshCashContext(); online = false
    await f.api.submitControlledDocument("sale", { paymentMethod: "EFECTIVO" }, { id: "ana", accountId: f.context.accountId })
    const pending = await f.api.cashPending()
    assert(pending.length === 1 && pending[0].cashOperation.fiscalPolicyVersion === 7, "La versión debe persistirse en IndexedDB")
    online = true; delete f.context.fiscalQueuePolicy; await f.api.refreshCashContext(); online = false
    await rejects(() => f.api.submitControlledDocument("sale", { paymentMethod: "EFECTIVO" }, { id: "ana", accountId: f.context.accountId }), "Una copia sin versión no autoriza pendientes nuevos")
    assert((await f.api.cashPending()).length === 1, "No debe añadirse ni eliminarse otro pendiente")
  })
  await test("Detalle offline usa la copia propia y separa pendientes sin inventar totales", async () => {
    const f = fixture(); f.setReport(reportFor(f)); await f.api.refreshCashContext(); await f.api.refreshCashShiftReport(f.context)
    online = false; await f.api.submitControlledDocument("payment", { method: "TARJETA", amountCents: 1250 }, { id: "ana", accountId: f.context.accountId })
    await f.api.submitControlledDocument("sale", { paymentMethod: "EFECTIVO" }, { id: "ana", accountId: f.context.accountId }, undefined, 2300)
    const report = await f.api.loadCashShiftReport(f.context, { id: "ana", accountId: f.context.accountId })
    assert(report.provisional && report.snapshot.expectedCashCents === 10000 && report.local.length === 2 && report.local[0].status === "pending", "Debe conservar el corte y separar los pendientes")
    const sale = report.local.find(row => row.kind === "sale")
    assert(sale.amountCents === 2300 && sale.recordedAt, "Debe conservar importe indicado y hora sin añadirlos al corte confirmado")
    await rejects(() => f.api.loadCashShiftReport(f.context, { id: "otro", accountId: f.context.accountId }), "No entregar el detalle a otro empleado")
  })
  await test("Una respuesta perdida incluida en el corte no duplica el pendiente", async () => {
    const f = fixture(); f.setReport(reportFor(f)); await f.api.refreshCashContext(); f.setDrop()
    await f.api.submitControlledDocument("sale", { paymentMethod: "EFECTIVO" }, { id: "ana", accountId: f.context.accountId })
    f.setReport(reportFor(f, [...f.seen.keys()]))
    const report = await f.api.loadCashShiftReport(f.context, { id: "ana", accountId: f.context.accountId })
    assert(report.local.length === 0 && report.snapshot.confirmedOperationIds.length === 1, "No mostrar la misma operación dos veces")
  })
  await test("Una confirmación reciente sobrevive si no se pudo renovar la copia", async () => {
    const f = fixture(); f.setReport(reportFor(f)); await f.api.refreshCashContext(); await f.api.refreshCashShiftReport(f.context)
    f.setReport(null); await f.api.submitControlledDocument("sale", { paymentMethod: "EFECTIVO" }, { id: "ana", accountId: f.context.accountId })
    online = false
    const report = await f.api.loadCashShiftReport(f.context, { id: "ana", accountId: f.context.accountId })
    assert(report.provisional && report.local.length === 1 && report.local[0].status === "confirmed", "La respuesta confirmada debe permanecer hasta incorporarse al corte")
    online = true; f.setReport(reportFor(f, [...f.seen.keys()]))
    const refreshed = await f.api.loadCashShiftReport(f.context, { id: "ana", accountId: f.context.accountId })
    assert(refreshed.local.length === 0, "La confirmación deja de listarse por separado al incorporarse al corte")
  })
  await test("Un movimiento manual con respuesta perdida se muestra una sola vez", async () => {
    const f = fixture(); f.setReport(reportFor(f)); await f.api.refreshCashContext(); await f.api.refreshCashShiftReport(f.context)
    f.setDrop(); await rejects(() => f.api.sendManualCashMovement({ shiftId: f.context.activeShift.id, kind: "OWNER_OUT", amountCents: 500, note: "Retiro" }), "Debe conservar la operación por confirmar")
    online = false
    const local = await f.api.loadCashShiftReport(f.context, { id: "ana", accountId: f.context.accountId })
    assert(local.provisional && local.local.length === 1 && local.local[0].kind === "manual", "Debe incluir el movimiento incierto una sola vez")
    online = true; f.setReport(reportFor(f, [...f.manualSeen.keys()]))
    const updated = await f.api.loadCashShiftReport(f.context, { id: "ana", accountId: f.context.accountId })
    assert(updated.local.length === 0, "Un movimiento ya presente en el corte no se duplica")
  })
  await test("Sin copia previa el detalle offline se identifica como incompleto", async () => {
    const f = fixture(); await f.api.refreshCashContext(); online = false
    const report = await f.api.loadCashShiftReport(f.context, { id: "ana", accountId: f.context.accountId })
    assert(report.provisional && !report.snapshot, "No inventar datos confirmados")
  })
  await test("Limpiar el reporte de un cierre no borra la cola ni el contexto", async () => {
    const f = fixture(); f.setReport(reportFor(f)); await f.api.refreshCashContext(); await f.api.refreshCashShiftReport(f.context)
    online = false; await f.api.submitControlledDocument("payment", { amountCents: 300, method: "EFECTIVO" }, { id: "ana", accountId: f.context.accountId })
    await f.api.clearCashShiftReport(f.context)
    const report = await f.api.loadCashShiftReport(f.context, { id: "ana", accountId: f.context.accountId })
    assert(!report.snapshot && report.local.length === 1 && (await f.api.cashPending()).length === 1, "Solo debe eliminar datos del reporte, no pendientes")
    online = true
    await rejects(() => f.api.refreshCashShiftReport(f.context), "Una respuesta tardía no debe restaurar la copia del cierre")
  })
  await test("Una sesión rechazada no autoriza imprimir el reporte cacheado", async () => {
    const f = fixture(); f.setReport(reportFor(f)); await f.api.refreshCashContext(); await f.api.refreshCashShiftReport(f.context)
    f.setReport("unauthorized")
    await rejects(() => f.api.loadCashShiftReport(f.context, { id: "ana", accountId: f.context.accountId }), "Un 401, incluso sin JSON, no debe usar la copia")
  })
  await test("Sin turnos, la cola conserva autoría y versión fiscal", async () => {
    const f = fixture(false)
    await f.api.refreshCashContext(); online = false
    const result = await f.api.submitControlledDocument("sale", { total: 100 }, { id: "ana", accountId: f.context.accountId })
    const pending = await f.api.cashPending()
    assert(result.pending && pending.length === 1, "Debe conservar la venta")
    assert(pending[0].cashOperation.cashShiftId === null && pending[0].cashOperation.userId === "ana" && pending[0].cashOperation.fiscalPolicyVersion === 0, "No debe inventar un turno ni perder identidad o versión")
    online = true; await f.api.syncCashOutbox()
    assert((await f.api.cashPending()).length === 0 && f.seen.size === 1, "Debe confirmar una sola vez")
  })
  await test("Sin turnos, una respuesta perdida se recupera con el mismo identificador", async () => {
    const f = fixture(false); f.setDrop()
    const result = await f.api.submitControlledDocument("sale", { total: 100 }, { id: "ana", accountId: f.context.accountId })
    const pending = await f.api.cashPending()
    assert(result.pending && pending.length === 1 && f.seen.size === 1, "Conservar el pendiente tras perder la respuesta")
    const id = pending[0].cashOperation.clientOperationId
    await f.api.syncCashOutbox()
    assert((await f.api.cashPending()).length === 0 && f.seen.size === 1 && f.seen.has(id), "El reintento debe recuperar la misma venta")
  })
  await test("Sin conexión persiste autoría, turno y secuencia antes de devolver guardado", async () => {
    const f = fixture(); await f.api.refreshCashContext(); online = false
    const result = await f.api.submitControlledDocument("sale", { items: [1] }, { id: "ana", accountId: f.context.accountId })
    const pending = await f.api.cashPending()
    assert(result.pending && pending.length === 1, "Debe persistir sin conexión")
    assert(pending[0].cashOperation.userId === "ana" && pending[0].cashOperation.cashShiftId === f.context.activeShift.id && pending[0].cashOperation.clientSequence === 1, "Debe conservar identidad y secuencia")
  })
  await test("Respuesta perdida se recupera usando el mismo identificador", async () => {
    const f = fixture(); f.setDrop()
    const result = await f.api.submitControlledDocument("sale", { items: [1] })
    assert(result.pending && f.seen.size === 1, "Debe quedar pendiente aunque servidor haya confirmado")
    await f.api.syncCashOutbox()
    assert((await f.api.cashPending()).length === 0 && f.seen.size === 1, "El reintento no duplica")
  })
  await test("Dos envíos simultáneos reciben secuencias distintas y se confirman una vez", async () => {
    const f = fixture()
    await Promise.all([f.api.submitControlledDocument("sale", { id: 1 }), f.api.submitControlledDocument("payment", { id: 2 })])
    await f.api.syncCashOutbox()
    assert(f.context.activeShift.lastSequence === 2 && f.seen.size === 2, "Las secuencias deben ser contiguas")
    assert((await f.api.cashPending()).length === 0, "La cola debe quedar vacía")
  })
  await test("Congelar impide agregar nuevas operaciones desde otra llamada", async () => {
    const f = fixture(); await f.api.refreshCashContext(); online = false
    await f.api.submitControlledDocument("sale", { id: 1 })
    const sequence = await f.api.freezeCashShift(f.context)
    assert(sequence === 1, "El cierre debe incluir el último pendiente local")
    await rejects(() => f.api.submitControlledDocument("sale", { id: 2 }), "Debe impedir nuevas ventas")
    assert((await f.api.cashPending()).length === 1, "No debe cambiar la cola")
    await f.api.unfreezeCashShift(f.context.activeShift.id)
    await f.api.submitControlledDocument("sale", { id: 3 })
    assert((await f.api.cashPending()).length === 2, "Debe permitir reanudar")
  })
  await test("Reanudar sin estado local conserva la secuencia confirmada en el servidor", async () => {
    const f = fixture(); f.context.activeShift.lastSequence = 7; await f.api.refreshCashContext()
    await f.api.unfreezeCashShift(f.context.activeShift.id)
    online = false
    await f.api.submitControlledDocument("sale", { id: 8 })
    const pending = await f.api.cashPending()
    assert(pending[0].cashOperation.clientSequence === 8, "Debe usar la última secuencia del servidor cuando falta el estado local")
    assert(await f.api.freezeCashShift(f.context) === 8, "El cierre debe conservar la secuencia recuperada")
  })
  await test("Empleado distinto y dispositivo ajeno no pueden guardar ventas", async () => {
    const f = fixture(); await f.api.refreshCashContext(); online = false
    await rejects(() => f.api.submitControlledDocument("sale", {}, { id: "luis", accountId: f.context.accountId }), "Debe rechazar cambio de empleado")
    online = true; f.context.activeShift.isDevice = false
    await rejects(() => f.api.submitControlledDocument("sale", {}), "Debe rechazar dispositivo ajeno")
    assert((await f.api.cashPending()).length === 0, "No se deben guardar operaciones inválidas")
  })
  await test("Error de negocio conserva el pendiente y permite anularlo con motivo", async () => {
    const f = fixture(); f.setValidation(true)
    await f.api.submitControlledDocument("sale", { item: "invalid" })
    const pending = await f.api.cashPending()
    assert(pending.length === 1 && pending[0].error === "Revisa el producto", "Debe conservar el error y los datos")
    await rejects(() => f.api.discardCashPending(pending[0].id, ""), "No se debe descartar sin motivo")
    await f.api.discardCashPending(pending[0].id, "Producto eliminado, se registrará de nuevo")
    assert((await f.api.cashPending()).length === 0 && f.context.activeShift.lastSequence === 1, "Debe confirmar la secuencia de la anulación")
    f.setValidation(false)
    await f.api.submitControlledDocument("sale", { item: "valid" })
    assert(f.context.activeShift.lastSequence === 2, "La anulación no debe bloquear los siguientes pendientes")
  })
  await test("Movimiento manual con respuesta perdida se conserva y bloquea el cierre hasta confirmarse", async () => {
    const f = fixture(); await f.api.refreshCashContext(); f.setDrop()
    const input = { shiftId: f.context.activeShift.id, kind: "TRANSFER_OUT", amountCents: 1000, otherAccountId: "bank", note: "Depósito" }
    await rejects(() => f.api.sendManualCashMovement(input), "La primera respuesta se pierde")
    assert(await f.api.manualCashPending(input.shiftId), "Debe conservar el movimiento")
    await rejects(() => f.api.freezeCashShift(f.context), "No debe cerrar con movimiento sin confirmar")
    await f.api.sendManualCashMovement(input)
    assert(f.manualSeen.size === 1 && !(await f.api.manualCashPending(input.shiftId)), "Debe confirmar sin duplicar")
    await f.api.freezeCashShift(f.context)
  })
  await test("Cambiar empleado no elimina ni reenvía un movimiento manual ajeno", async () => {
    const f = fixture(); await f.api.refreshCashContext(); f.setDrop()
    const input = { shiftId: f.context.activeShift.id, kind: "OWNER_OUT", amountCents: 1000, note: "Retiro" }
    await rejects(() => f.api.sendManualCashMovement(input), "La respuesta se pierde")
    f.context.userId = "luis"
    await rejects(() => f.api.sendManualCashMovement(input), "Otro empleado no puede reenviar el movimiento")
    assert((await f.api.manualCashPending(input.shiftId)).userId === "ana", "Debe conservar la autoría original")
    f.context.userId = "ana"
    await f.api.sendManualCashMovement(input)
    assert(f.manualSeen.size === 1, "No debe duplicar el retiro")
  })
  await test("Errores inesperados después del commit conservan el identificador del retiro", async () => {
    for (const status of [500, 400]) {
      const f = fixture(); await f.api.refreshCashContext(); f.setManualError(status)
      const input = { shiftId: f.context.activeShift.id, kind: "OWNER_OUT", amountCents: 1000, note: "Retiro" }
      await rejects(() => f.api.sendManualCashMovement(input), "Debe informar el error")
      assert(await f.api.manualCashPending(input.shiftId), "No debe olvidar un resultado incierto")
      await f.api.sendManualCashMovement(input)
      assert(f.manualSeen.size === 1 && !(await f.api.manualCashPending(input.shiftId)), "Debe recuperar el mismo retiro")
    }
  })
  await test("Una respuesta tardía de otra pestaña no borra el movimiento siguiente", async () => {
    const f = fixture(); await f.api.refreshCashContext()
    const serverFetch = window.fetch, responses = []
    let entered
    const bothSent = new Promise(resolve => { entered = resolve })
    window.fetch = async (url, options = {}) => {
      const response = await serverFetch(url, options)
      if (options.method && JSON.parse(options.body).action === "movement") return new Promise(resolve => { responses.push(() => resolve(response)); if (responses.length === 2) entered() })
      return response
    }
    const input = { shiftId: f.context.activeShift.id, kind: "OWNER_OUT", amountCents: 1000, note: "Primer retiro" }
    const one = f.api.sendManualCashMovement(input), two = f.api.sendManualCashMovement(input)
    await bothSent; responses[0](); await Promise.race([one, two])
    const next = { ...input, amountCents: 2000, note: "Segundo retiro" }
    f.setDrop()
    await rejects(() => f.api.sendManualCashMovement(next), "La respuesta del segundo retiro se pierde")
    responses[1](); await Promise.all([one, two])
    assert((await f.api.manualCashPending(input.shiftId))?.input.note === "Segundo retiro", "La respuesta anterior debe conservar el nuevo pendiente")
    window.fetch = serverFetch
    await f.api.sendManualCashMovement(next)
    assert(f.manualSeen.size === 2, "Debe haber exactamente dos retiros distintos")
  })
  await test("Un error tardío de sincronización no restaura un pendiente ya anulado", async () => {
    const f = fixture(); await f.api.refreshCashContext(); online = false
    await f.api.submitControlledDocument("sale", { item: "invalid" })
    const pending = (await f.api.cashPending())[0]
    online = true; f.setValidation(true)
    const serverFetch = window.fetch
    let entered, release
    const sent = new Promise(resolve => { entered = resolve })
    window.fetch = async (url, options = {}) => {
      const response = await serverFetch(url, options)
      if (options.method && JSON.parse(options.body).kind === "sale") { entered(); await new Promise(resolve => { release = resolve }) }
      return response
    }
    const sync = f.api.syncCashOutbox().then(() => false, () => true)
    await sent
    await f.api.discardCashPending(pending.id, "Producto inválido")
    release(); assert(await sync, "La sincronización debe informar el rechazo original")
    assert((await f.api.cashPending()).length === 0, "El error tardío no debe restaurar la operación anulada")
  })
  await test("Un rechazo de negocio confirmado permite corregir el movimiento sin dinero duplicado", async () => {
    const f = fixture(); await f.api.refreshCashContext(); f.setManualError(400, "CASH_ACCOUNT_INVALID")
    const input = { shiftId: f.context.activeShift.id, kind: "TRANSFER_OUT", amountCents: 1000, otherAccountId: "invalid", note: "Depósito" }
    await rejects(() => f.api.sendManualCashMovement(input), "La cuenta inválida se rechaza")
    assert(!(await f.api.manualCashPending(input.shiftId)) && f.manualSeen.size === 0, "El rechazo confirmado no registra dinero")
    await f.api.sendManualCashMovement({ ...input, otherAccountId: "bank" })
    assert(f.manualSeen.size === 1, "Debe permitir corregir y registrar una vez")
  })
  await test("Gastos y compras bancarios fuera de turno conservan identidad sin tomar la caja", async () => {
    const f = fixture(); f.context.activeShift = null; await f.api.refreshCashContext()
    f.setDrop()
    const result = await f.api.submitControlledDocument("expense", { treasuryAccountId: "bank", paymentMethod: "TRANSFERENCIA", amountCents: 1000 })
    assert(result.pending, "Debe conservar la respuesta perdida")
    const pending = await f.api.cashPending()
    assert(pending[0].cashOperation.cashShiftId === null && pending[0].cashOperation.clientSequence === null, "No debe inventar un turno")
    await f.api.syncCashOutbox()
    assert(f.seen.size === 1 && (await f.api.cashPending()).length === 0, "No debe duplicar el gasto")
    await rejects(() => f.api.submitControlledDocument("expense", { treasuryAccountId: "box", paymentMethod: "EFECTIVO" }), "Debe exigir turno para el efectivo")
    online = false
    await rejects(() => f.api.submitControlledDocument("purchase", { treasuryAccountId: "bank", paymentMethod: "TRANSFERENCIA" }), "Las compras requieren conexión al iniciar")
  })
  document.getElementById("result").textContent = JSON.stringify(results)
}
const target = path.join(root, "tmp", "cash-offline-browser.html")
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>(${browserSuite.toString()})(${JSON.stringify(source)}, ${JSON.stringify(stockStateSource)}).catch(e=>document.getElementById('result').textContent=JSON.stringify([{ok:false,error:e.message}]));</script>`)
const profile = path.join(root, "tmp", `cash-browser-profile-${Date.now()}`)
const child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions", "--disable-background-networking", "--disable-component-update", "--disable-sync", `--user-data-dir=${profile}`, "--allow-file-access-from-files", "--remote-debugging-port=0", "about:blank"], { windowsHide: true, stdio: "ignore" })
let startupError
child.on("error", error => { startupError = error })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const portFile = path.join(profile, "DevToolsActivePort")
let connection
for (let i = 0; i < 150 && !connection && !startupError; i++) {
  // Windows puede bloquear el archivo mientras Chrome todavía escribe el puerto.
  try { const lines = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/); if (lines[0] && lines[1]) connection = lines }
  catch (error) { if (!["ENOENT", "EBUSY", "EACCES"].includes(error.code)) throw error }
  if (!connection) await wait(100)
}
if (startupError) throw startupError
if (!connection) throw new Error("Chrome no inició su instancia temporal de pruebas")
const [port, socketPath] = connection
const socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let nextId = 0
const calls = new Map()
socket.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { const call = calls.get(message.id); calls.delete(message.id); if (message.error) call?.reject(new Error(message.error.message)); else call?.resolve(message.result) } }
const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++nextId; calls.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })) })
let results
try {
  const { targetId } = await call("Target.createTarget", { url: pathToFileURL(target).href })
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true })
  for (let i = 0; i < 200; i++) {
    const state = await call("Runtime.evaluate", { expression: 'document.getElementById("result")?.textContent', returnByValue: true }, sessionId)
    if (state.result?.value && state.result.value !== "RUNNING") { results = JSON.parse(state.result.value); break }
    await wait(100)
  }
  if (!results) throw new Error("El navegador no terminó las pruebas offline")
} finally {
  await call("Browser.close").catch(() => {})
  socket.close()
}
for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name ?? "Navegador"}${result.error ? ": " + result.error : ""}`)
if (results.some(r => !r.ok)) process.exitCode = 1
