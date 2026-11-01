import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"

export async function runBrowserSuite(root, name, html) {
  const browser = [process.env.CASH_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean).find(p => fs.existsSync(p))
  if (!browser) throw new Error("Define CASH_TEST_BROWSER con Chrome o Edge")
  const target = path.join(root, "tmp", `${name}.html`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, html)
  const profile = path.join(root, "tmp", `${name}-profile-${Date.now()}`)
  const child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions", "--disable-background-networking", "--disable-component-update", "--disable-sync", `--user-data-dir=${profile}`, "--allow-file-access-from-files", "--remote-debugging-port=0", "about:blank"], { windowsHide: true, stdio: "ignore" })
  let startupError
  child.on("error", error => { startupError = error })
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const portFile = path.join(profile, "DevToolsActivePort")
  // Windows puede mantener el archivo bloqueado brevemente mientras Chrome lo escribe.
  let address
  for (let i = 0; i < 150 && !startupError; i++) {
    try {
      const lines = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/)
      if (lines.length === 2 && lines[1].startsWith("/devtools/")) { address = lines; break }
    } catch (error) { if (!["ENOENT", "EBUSY", "EACCES"].includes(error.code)) { child.kill(); throw error } }
    await wait(100)
  }
  if (startupError || !address) { child.kill(); throw startupError ?? new Error("Chrome no inició su instancia temporal de pruebas") }
  const [port, socketPath] = address
  const socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let nextId = 0
  const calls = new Map()
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const pending = calls.get(message.id); calls.delete(message.id)
      if (message.error) pending?.reject(new Error(message.error.message))
      else pending?.resolve(message.result)
    }
  }
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId; calls.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  let results
  try {
    const { targetId } = await call("Target.createTarget", { url: pathToFileURL(target).href })
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true })
    for (let i = 0; i < 600; i++) {
      const state = await call("Runtime.evaluate", { expression: 'document.getElementById("result")?.textContent', returnByValue: true }, sessionId)
      if (state.result?.value && state.result.value !== "RUNNING") { results = JSON.parse(state.result.value); break }
      await wait(100)
    }
    if (!results) {
      const debug = await call("Runtime.evaluate", { expression: 'JSON.stringify({text:document.body.innerText,errors:window.__errors})', returnByValue: true }, sessionId)
      throw new Error(`El navegador no terminó: ${debug.result?.value}`)
    }
  } finally { await call("Browser.close").catch(() => {}); socket.close() }
  for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name ?? "Navegador"}${result.error ? ": " + result.error : ""}`)
  if (results.some(result => !result.ok)) process.exitCode = 1
}
