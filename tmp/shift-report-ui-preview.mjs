import postcss from "postcss";
import tailwindcss from "tailwindcss";
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
 const context={protocolVersion:1,accountId:'cash-preview',userId:'preview',userName:'María Rodríguez',isOwner:true,enabled:true,canOperate:true,canViewAll:true,canManage:true,canTransfer:true,canRecordMovements:true,treasuryAccountId:'box',expectedOpeningCents:null,collectionsByMethod:[{method:'EFECTIVO',totalCents:22200},{method:'TARJETA',totalCents:7500},{method:'TRANSFERENCIA',totalCents:18800}],breakdown:[{accountName:'Caja Efectivo',method:'EFECTIVO',totalCents:22200},{accountName:'Banco',method:'TRANSFERENCIA',totalCents:18800}],activeShift:{id:'shift-preview',status:'OPEN',cashierName:'María Rodríguez',isMine:true,isDevice:true,openedAt:new Date().toISOString(),lastSequence:0,finalSequence:null,openingCountedCents:11100,expectedCashCents:33300}};
 window.cashPreviewContext=context;
 window.fetch=async(url,options={})=>{if(options.method){const body=JSON.parse(options.body);if(body.action==='prepare'){context.activeShift.status='CLOSING';context.activeShift.finalSequence=body.finalSequence;}return new Response(JSON.stringify({ok:true}),{status:200});}return new Response(JSON.stringify(url.includes('view=history')?[]:url.includes('/treasury/accounts')?{data:[{id:'box',name:'Caja Efectivo'},{id:'bank',name:'Banco'}]}:context),{status:200});};
 createRoot(document.getElementById('test-root')).render(React.createElement(CashShiftsClient));
 for(let i=0;i<100;i++){if([...document.querySelectorAll('button')].some(b=>b.textContent==='Cerrar mi turno'))break;await new Promise(r=>setTimeout(r,20));}
 document.getElementById('result').textContent=JSON.stringify([{ok:true,name:'Vista previa del turno de caja'}]);
}

const compiled = await build({ stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { CashShiftGate, useCashShiftAccess } from "./src/components/app/cash-shift-gate"; import { CashShiftsClient } from "./src/app/(app)/daily-close/cash-shifts-client"; import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./src/components/ui/dialog"; import { cashPending, refreshCashContext, submitControlledDocument } from "./src/lib/cash-offline"; import { openCashShiftFromClient } from "./src/lib/cash-shift-opening"; import { getPendingCounts } from "./src/lib/indexed-db"; (${browserSuite.toString()})().catch(error => document.getElementById("result").textContent = JSON.stringify([{ok:false,error:error.message}]));`, resolveDir: rootDir }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "test-navigation", setup(build) { build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "test" })); build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: 'import React from "react"; export default function Link(props) { return React.createElement("a", props); }', resolveDir: rootDir })) } }] })
const css=(await postcss([tailwindcss(path.join(rootDir,"tailwind.config.ts"))]).process(fs.readFileSync(path.join(rootDir,"src/app/globals.css"),"utf8"),{from:path.join(rootDir,"src/app/globals.css")})).css;
const target=path.join(rootDir,"tmp","shift-report-ui-preview.html")
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}#test-root{max-width:1240px;margin:32px auto;padding:0 24px}@media(max-width:600px){#test-root{margin:16px auto;padding:0 12px}}</style><div id="test-root"></div><pre id="result">RUNNING</pre><script>${compiled.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>`)
const profile = path.join(rootDir, "tmp", `shift-report-ui-preview-profile-${Date.now()}`)
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
  if (!results) throw new Error("El navegador no terminó la vista previa");

 for(const layout of [{name:'open-desktop',width:1400,height:900,mobile:false,dark:false,closing:false},{name:'open-mobile',width:390,height:844,mobile:true,dark:false,closing:false},{name:'close-desktop',width:1400,height:1000,mobile:false,dark:false,closing:true},{name:'close-mobile',width:390,height:844,mobile:true,dark:false,closing:true},{name:'close-dark',width:1400,height:1000,mobile:false,dark:true,closing:true}]){
 await call('Emulation.setDeviceMetricsOverride',{width:layout.width,height:layout.height,deviceScaleFactor:1,mobile:layout.mobile},sessionId);
 await call('Runtime.evaluate',{expression:'document.documentElement.classList.toggle("dark",'+layout.dark+');document.getElementById("result").style.display="none"'},sessionId);
 if(layout.closing){await call('Runtime.evaluate',{expression:"[...document.querySelectorAll(\"button\")].find(b=>b.textContent===\"Cerrar mi turno\")?.click()"},sessionId);for(let i=0;i<100;i++){const state=await call('Runtime.evaluate',{expression:"Boolean(document.getElementById(\"cash-shift-counted\"))",returnByValue:true},sessionId);if(state.result.value)break;await wait(20);}}
 await wait(180);
 const metric=await call('Runtime.evaluate',{expression:"(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}))()",returnByValue:true},sessionId);
 console.log(layout.name,JSON.stringify(metric.result.value));
 if(metric.result.value.scroll>metric.result.value.width+1)throw new Error('Desbordamiento horizontal');
 await call('Runtime.evaluate',{expression:'window.scrollTo(0,0)'},sessionId); const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);
 fs.writeFileSync(path.join(rootDir,'tmp','shift-report-ui-'+layout.name+'.png'),Buffer.from(screenshot.data,'base64'));
 }

} finally { await call("Browser.close").catch(() => {}); socket.close() }
for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name ?? "Navegador"}${result.error ? ": " + result.error : ""}`)
if (results.some(result => !result.ok)) process.exitCode = 1
