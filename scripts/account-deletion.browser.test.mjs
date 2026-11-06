// Componentes y almacenamiento reales en Chrome; Clerk y las respuestas de la API son ficticios.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { runBrowserSuite } from "./run-browser-suite.mjs"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function browserSuite() {
  const results = [], sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const assert = (value, message) => { if (!value) throw new Error(message) }
  async function until(check, message) { for (let i = 0; i < 400; i++) { if (check()) return; await sleep(10) } throw new Error(message) }
  async function test(name, run) { try { await run(); results.push({ ok: true, name }) } catch (error) { results.push({ ok: false, name, error: error.stack }) } }
  async function fill(id, value) {
    const input = document.getElementById(id)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true })); await sleep(30)
  }
  let view, requests = [], respond = async () => Response.json({ error: "El PIN no es correcto." }, { status: 400 })
  window.__signOut = options => { window.__signOutOptions = options; return new Promise(() => {}) }
  window.fetch = async (url, init = {}) => {
    if (url === "/api/health-check") return new Response(null, { status: 200 })
    if (url === "/api/account") { requests.push({ url, init }); return respond() }
    return Response.json({ success: true })
  }
  async function mount(component, props = {}) {
    view?.unmount(); await sleep(30)
    view = createRoot(document.getElementById("test-root"))
    view.render(React.createElement(component, props)); await sleep(80)
  }
  const submit = () => document.querySelector('button[type="submit"]')
  async function ready() { await fill("deletion-pin", "4321"); await fill("deletion-confirmation", "ELIMINAR") }

  await test("Un enlace público sin una baja aceptada conserva los datos y la sesión", async () => {
    localStorage.setItem("movopos-user", "fixture")
    await mount(DeletedAccountCleanup, { allowCleanup: false })
    assert(localStorage.getItem("movopos-user") === "fixture", "La página pública limpió una cuenta ajena")
    assert(!window.__signOutOptions, "Cerró la sesión sin una baja aceptada")
  })

  await test("Confirmación exacta, PIN y conexión habilitan el botón", async () => {
    await mount(DeleteAccountForm)
    assert(submit().disabled, "Debe pedir confirmación")
    await fill("deletion-pin", "4321"); await fill("deletion-confirmation", "eliminar")
    assert(submit().disabled, "Aceptó una frase distinta")
    await fill("deletion-confirmation", "ELIMINAR")
    assert(!submit().disabled, "No habilitó la confirmación válida")
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })
    window.dispatchEvent(new Event("offline")); await sleep(30)
    assert(submit().disabled && document.body.textContent.includes("Necesitas conexión"), "Permite eliminar sin conexión")
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true })
    window.dispatchEvent(new Event("online")); await sleep(60)
  })

  await test("Un PIN rechazado muestra el error y conserva el almacenamiento", async () => {
    await mount(DeleteAccountForm); await ready(); requests = []
    submit().click()
    await until(() => document.querySelector('[role="alert"]')?.textContent.includes("PIN"), "No mostró el error de PIN")
    assert(localStorage.getItem("movopos-user") === "fixture", "El rechazo borró datos locales")
    assert(!submit().disabled && requests.length === 1, "No permite corregir el PIN")
  })

  await test("La aceptación bloquea doble envío, limpia pendientes y redirige al resultado completo", async () => {
    // Base antigua creada después de la migración para verificar que la baja también la vacía.
    const legacy = await new Promise((resolve, reject) => {
      const request = indexedDB.open("tejada-pos-offline", 1)
      request.onupgradeneeded = () => request.result.createObjectStore("pendingSales", { keyPath: "tempId" })
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    await new Promise((resolve, reject) => { const tx = legacy.transaction("pendingSales", "readwrite"); tx.objectStore("pendingSales").put({ tempId: "legacy", customerId: "private" }); tx.oncomplete = resolve; tx.onerror = reject })
    await offline.savePendingSale({ tempId: "pending", customerId: null, type: "CONTADO", items: [], username: "fixture", createdAt: Date.now() })
    await offline.savePendingPayment({ tempId: "payment", arId: "ar", amountCents: 100, method: "EFECTIVO", username: "fixture", createdAt: Date.now() })
    await offline.savePendingBatchPayment({ tempId: "batch", arIds: ["ar"], amountCents: 100, method: "EFECTIVO", username: "fixture", createdAt: Date.now() })
    await offline.saveProductsCache([{ id: "product", name: "Privado" }])
    localStorage.setItem("tejada-pos-user", "legacy")
    localStorage.setItem("posCartState", "private")
    sessionStorage.setItem("movopos-onboarding-skip:fixture", "private")
    await mount(DeleteAccountForm); await ready()
    assert(document.body.textContent.includes("operaciones pendientes"), "No advierte sobre los pendientes")
    requests = []; let release
    respond = () => new Promise(resolve => { release = resolve })
    submit().click(); document.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await until(() => release, "No inició la petición")
    assert(submit().disabled && requests.length === 1, "Duplicó la eliminación")
    const body = JSON.parse(requests[0].init.body)
    assert(body.pin === "4321" && body.confirmation === "ELIMINAR" && !body.accountId, "Contrato incorrecto")
    release(Response.json({ success: true, status: "completed" }, { status: 200 }))
    await until(() => window.__signOutOptions, "No cerró Clerk después de limpiar")
    assert(window.__signOutOptions.redirectUrl.endsWith("estado=completada"), "Destino incorrecto para 200")
    assert((await offline.getPendingSales()).length === 0, "Quedaron ventas pendientes")
    assert((await offline.getPendingPayments()).length === 0, "Quedaron pagos pendientes")
    assert((await offline.getPendingBatchPayments()).length === 0, "Quedaron pagos agrupados")
    assert((await offline.getProductsCache()).length === 0, "Quedaron productos")
    assert(!localStorage.getItem("movopos-user") && !localStorage.getItem("tejada-pos-user") && !localStorage.getItem("posCartState"), "Quedaron claves actuales o antiguas")
    assert(!sessionStorage.getItem("movopos-onboarding-skip:fixture"), "Quedó sessionStorage")
    const legacyCount = await new Promise((resolve, reject) => { const r = legacy.transaction("pendingSales").objectStore("pendingSales").count(); r.onsuccess = () => resolve(r.result); r.onerror = reject })
    assert(legacyCount === 0, "Quedaron datos legacy")
    legacy.close()
    let blocked = false
    try { await offline.saveProductsCache([{ id: "late" }]) } catch { blocked = true }
    assert(blocked && (await offline.getProductsCache()).length === 0, "Una sincronización tardía repobló el caché")
  })

  await test("Respuesta 202 cierra sesión y presenta eliminación en proceso", async () => {
    window.__signOutOptions = null
    respond = async () => Response.json({ success: true, status: "processing" }, { status: 202 })
    await mount(DeleteAccountForm); await ready(); submit().click()
    await until(() => window.__signOutOptions, "No cerró la sesión para 202")
    assert(window.__signOutOptions.redirectUrl.endsWith("estado=procesando"), "Destino incorrecto para 202")
  })
  view?.unmount()
  document.getElementById("result").textContent = JSON.stringify(results)
}

const compiled = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {DeleteAccountForm} from './src/app/account/delete/delete-account-form'; import {DeletedAccountCleanup} from './src/app/cuenta-eliminada/deleted-account-cleanup'; import * as offline from './src/lib/indexed-db'; (${browserSuite.toString()})().catch(error=>document.getElementById('result').textContent=JSON.stringify([{ok:false,error:error.stack}]));`, resolveDir: root },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "deletion-browser-boundaries", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "deletion-test" }))
    builder.onResolve({ filter: /^@clerk\/nextjs$/ }, () => ({ path: "clerk", namespace: "deletion-test" }))
    builder.onLoad({ filter: /.*/, namespace: "deletion-test" }, args => ({
      contents: args.path === "clerk" ? 'const clerk={signOut:(options)=>window.__signOut(options)};export function useClerk(){return clerk};export function useAuth(){return {isSignedIn:true}}' : 'import React from "react";export default function Link(props){return React.createElement("a",props)}', resolveDir: root,
    }))
  } }],
})
await runBrowserSuite(root, "account-deletion-browser", `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="test-root"></div><pre id="result">RUNNING</pre><script>${compiled.outputFiles[0].text}</script>`)
