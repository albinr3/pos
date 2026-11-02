// React, controles e IndexedDB reales; servidor simulado y perfil de navegador aislado.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { runBrowserSuite } from "./run-browser-suite.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function browserSuite() {
  const results = []
  let view, fixture, serial = 0
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const button = text => [...document.querySelectorAll("button")].find(element => element.textContent.trim() === text)
  // Leer solo el árbol de React: el script de prueba también contiene los textos esperados.
  const content = () => document.getElementById("test-root").textContent
  const mode = () => document.getElementById("cash-control-mode")
  const review = () => document.querySelector('[aria-label="Activación de múltiples turnos"]')
  const submit = () => button("Confirmar y activar múltiples turnos")
  async function until(fn, message) {
    for (let i = 0; i < 250; i++) { if (fn()) return; await sleep(10) }
    throw new Error(message)
  }
  async function test(name, fn) {
    try { await fn(); results.push({ ok: true, name }) }
    catch (error) { results.push({ ok: false, name, error: error.message }) }
  }
  async function render(component = CashModeSettings) {
    view?.unmount(); await sleep(20)
    view = createRoot(document.getElementById("test-root"))
    view.render(React.createElement(component))
    await until(() => mode() || button("Activar ahora") || button("Activar turnos de caja") || document.getElementById("cash-shift-counted"), "No cargó el modo de caja")
  }
  async function setup(extra = {}, component) {
    fixture = { posts: 0, previews: 0, lostResponse: false, stalePreview: false, context: { protocolVersion: 1, accountId: `cash-mode-${++serial}`, userId: "cashier", userName: "Ana", isOwner: true, enabled: false, ledgerStartedAt: null, canTransfer: false, canRecordMovements: false, breakdown: [], collectionsByMethod: null, treasuryAccountId: null, canOperate: true, canViewAll: false, canManage: true, expectedOpeningCents: null, activeShift: null, ...extra } }
    window.fetch = async (url, options = {}) => {
      if (!options.method) {
        if (String(url).includes("view=preview")) {
          fixture.previews++
          return Response.json({ accounts: [{ id: "box", name: "Caja", type: "CAJA", isActive: true, currency: "DOP", balanceCents: 100000 }], unclassified: 1, future: 0, previewToken: `preview-${fixture.previews}` })
        }
        if (String(url).includes("view=history")) return Response.json([])
        if (String(url).includes("/treasury/accounts")) return Response.json([])
        return Response.json(fixture.context)
      }
      fixture.posts++
      const payload = JSON.parse(options.body)
      assert(payload.action === "activate", "La interfaz intentó desactivar turnos")
      assert(payload.treasuryAccountId === "box", "No se envió la caja elegida")
      if (fixture.stalePreview) return Response.json({ error: "Los saldos cambiaron. Actualiza la revisión antes de activar" }, { status: 409 })
      fixture.context.enabled = true
      fixture.context.treasuryAccountId = "box"
      if (fixture.lostResponse) throw new TypeError("Failed to fetch")
      return Response.json({ ok: true, data: null })
    }
    await render(component)
  }
  async function openReview() {
    mode().value = "multiple"
    mode().dispatchEvent(new Event("change", { bubbles: true }))
    await until(() => review() && submit(), "No abrió la revisión de saldos")
  }
  async function input(element, value) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
    await sleep(20)
  }
  async function fillCount(value = "1000") {
    const select = review().querySelector("select")
    select.value = "box"; select.dispatchEvent(new Event("change", { bubbles: true }))
    await input(review().querySelector("input"), value)
  }

  await test("Turno único explica el modo y seleccionar múltiples turnos no guarda sin confirmar", async () => {
    await setup()
    assert(mode().value === "single" && !mode().disabled, "Modo inicial incorrecto")
    assert(content().includes("Un cuadre general del día, sin aperturas y cierres por empleado"), "Falta la explicación de Turno único")
    await openReview()
    assert(content().includes("Una vez activado, no podrás volver al modo Turno único"), "Falta el aviso permanente")
    assert(content().includes("Revisa 1 operación(es) anteriores"), "Se perdió la revisión de operaciones anteriores")
    assert(fixture.posts === 0 && !fixture.context.enabled, "La selección activó el modo prematuramente")
    button("Cancelar").click()
    await until(() => !review(), "No se canceló la revisión")
    assert(mode().value === "single" && !fixture.context.enabled, "Cancelar no conservó Turno único")
  })
  await test("Activación valida conteo y diferencias, queda bloqueada y persiste al volver a entrar", async () => {
    await setup(); await openReview()
    assert(submit().disabled, "Se permitió activar sin contar efectivo")
    await fillCount("900")
    assert(submit().disabled, "Se permitió una diferencia sin motivo")
    await input(review().querySelectorAll("input")[1], "Conteo físico revisado")
    assert(!submit().disabled, "No se habilitó la confirmación válida")
    submit().click()
    await until(() => mode()?.value === "multiple" && !review(), "No terminó la activación")
    assert(mode().disabled && fixture.posts === 1, "El modo no quedó bloqueado")
    assert(content().includes("Este modo está activado de forma permanente"), "Falta explicación del bloqueo")
    await render()
    assert(mode().value === "multiple" && mode().disabled, "Se perdió el bloqueo al volver a entrar")
  })
  await test("Ajustes respeta el permiso específico de administrar turnos", async () => {
    await setup({ isOwner: false, canManage: false })
    assert(mode().disabled, "Un usuario sin permiso puede cambiar el modo")
    await setup({ isOwner: false, canManage: true })
    assert(!mode().disabled, "Un administrador de turnos no puede activar el modo")
  })
  await test("Los negocios ya habilitados quedan bloqueados desde la primera carga", async () => {
    await setup({ enabled: true, treasuryAccountId: "box" })
    assert(mode().value === "multiple" && mode().disabled, "Un negocio habilitado puede regresar a Turno único")
    await render(CashShiftsClient)
    assert(!content().includes("Desactivar control por turnos"), "Sigue visible la desactivación en el panel de caja")
  })
  await test("El recordatorio comparte revisión y conserva el descarte sin impedir configurar en Ajustes", async () => {
    await setup({}, CashShiftsClient)
    button("Activar ahora").click()
    await until(() => submit(), "El recordatorio no abrió el formulario compartido")
    assert(review().textContent.includes("Una vez activado"), "El recordatorio omite el aviso permanente")
    button("Cancelar").click()
    await until(() => button("Descartar y no volver a mostrar"), "No volvió el recordatorio")
    button("Descartar y no volver a mostrar").click()
    await render(CashShiftsClient)
    assert(!button("Activar ahora"), "El recordatorio descartado reapareció")
    await render()
    assert(!mode().disabled && mode().value === "single", "Descartar impide configurar el modo en Ajustes")
  })
  await test("Los saldos cambiados muestran el error y permiten revisar antes de reintentar", async () => {
    await setup(); await openReview(); await fillCount()
    fixture.stalePreview = true
    submit().click()
    await until(() => button("Actualizar saldos"), "No se mostró el error de saldos cambiados")
    assert(!fixture.context.enabled, "Una revisión inválida activó el modo")
    fixture.stalePreview = false
    button("Actualizar saldos").click()
    await until(() => fixture.previews === 2 && submit(), "No se actualizaron los saldos")
    button("Cancelar").click()
    await until(() => mode().value === "single", "No se pudo cancelar tras un error")
  })
  await test("Una respuesta perdida recupera la activación sin duplicarla ni ofrecer regresar", async () => {
    await setup(); await openReview(); await fillCount()
    fixture.lostResponse = true
    submit().click()
    await until(() => mode()?.disabled && mode()?.value === "multiple" && !review(), "No recuperó la activación confirmada")
    assert(fixture.posts === 1, "Se duplicó la activación")
  })
  await test("Cambiar de empleado durante la revisión impide enviar la activación", async () => {
    await setup(); await openReview(); await fillCount()
    fixture.context.userId = "another-user"
    submit().click()
    await until(() => document.querySelector('[role="alert"]'), "No se rechazó el cambio de empleado")
    assert(fixture.posts === 0 && !fixture.context.enabled, "Se activaron turnos con otra sesión")
  })
  await test("Las ventas pendientes bloquean la revisión y permiten cancelar", async () => {
    await setup()
    await savePendingSale({ tempId: "pending-mode", customerId: null, type: "CONTADO", items: [], username: "ana", createdAt: Date.now() })
    mode().value = "multiple"; mode().dispatchEvent(new Event("change", { bubbles: true }))
    await until(() => document.querySelector('[role="alert"]'), "No se detectaron ventas pendientes")
    assert(content().includes("Sincroniza las ventas"), "Falta la explicación de los pendientes")
    assert(fixture.previews === 0 && fixture.posts === 0, "Se omitió la protección de pendientes")
    await deletePendingSale("pending-mode")
    button("Cancelar").click()
    await until(() => mode().value === "single", "No permitió cancelar con pendientes")
  })
  await test("Los registros antiguos desactivados mantienen su caja al reactivar", async () => {
    await setup({ treasuryAccountId: "box", ledgerStartedAt: new Date().toISOString() })
    await openReview()
    assert(review().querySelector("select").value === "box", "No se conservó la caja del registro financiero existente")
    button("Cancelar").click()
  })
  view?.unmount()
  document.getElementById("result").textContent = JSON.stringify(results)
}

const compiled = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CashModeSettings} from './src/app/(app)/settings/cash-mode-settings'; import {CashShiftsClient} from './src/app/(app)/daily-close/cash-shifts-client'; import {savePendingSale,deletePendingSale} from './src/lib/indexed-db'; (${browserSuite.toString()})().catch(error=>document.getElementById('result').textContent=JSON.stringify([{ok:false,error:error.stack}]));`, resolveDir: root },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "cash-mode-navigation", setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "cash-test" }))
    build.onLoad({ filter: /.*/, namespace: "cash-test" }, () => ({ contents: 'import React from "react"; export default function Link(props){return React.createElement("a",props)}', resolveDir: root }))
  } }],
})
await runBrowserSuite(root, "cash-mode-browser", `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="test-root"></div><pre id="result">RUNNING</pre><script>window.__errors=[];window.addEventListener('error',e=>window.__errors.push(e.message));${compiled.outputFiles[0].text}</script>`)
