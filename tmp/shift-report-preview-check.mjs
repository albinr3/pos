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
 const now=new Date().toISOString(), movement=(id,type,method,amount,account)=>({id,sourceType:type,sourceId:id,reference:'FAC-'+id,method,amountCents:amount,recordedAt:now,note:null,treasuryAccount:{name:account}});
 const rows=[]; for(let i=0;i<12;i++) rows.push(movement(''+i,'sale',i%3===0?'EFECTIVO':i%3===1?'TARJETA':'TRANSFERENCIA',100000+i*1500,i%3?'Banco principal':'Caja efectivo'));
 rows.push(movement('g','operatingExpense','EFECTIVO',-12500,'Caja efectivo'),movement('t1','treasuryTransfer',null,-40000,'Caja efectivo'),movement('t2','treasuryTransfer',null,40000,'Banco principal'));
 const ctx={accountId:'preview',userId:'ana',activeShift:{id:'preview',cashierName:'María Rodríguez',openedAt:now}};
 const snapshot={accountId:'preview',userId:'ana',shiftId:'preview',cashierName:'María Rodríguez',openedAt:now,generatedAt:now,companyName:'Negocio de prueba',format:'CARTA',openingCents:100000,expectedCashCents:500000,lastSequence:1,finalSequence:1,status:'CLOSING',confirmedOperationIds:[],movements:rows,documents:[{id:'credit',sourceType:'sale',reference:'CR-001',amountCents:120000,cancelled:false}]};
 const report={snapshot,context:ctx,local:[{id:'pending-1',kind:'payment',payload:{method:'TARJETA',amountCents:12000},status:'pending'}],provisional:true,generatedAt:now};
 window.previewReportFormat=(format)=>{let s=document.getElementById('report-style');if(!s){s=document.createElement('style');s.id='report-style';document.head.appendChild(s)}s.textContent=reportStyles(format)};
 createRoot(document.getElementById('test-root')).render(React.createElement(ShiftReport,{report})); window.previewReportFormat('CARTA'); await new Promise(r=>setTimeout(r,100)); document.getElementById('result').textContent=JSON.stringify([{ok:true,name:'Reporte de prueba'}]);
}
const compiled = await build({ stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { ShiftReport, reportStyles } from "./src/components/app/shift-report-button"; import { CashShiftGate, useCashShiftAccess } from "./src/components/app/cash-shift-gate"; import { CashShiftsClient } from "./src/app/(app)/daily-close/cash-shifts-client"; import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./src/components/ui/dialog"; import { cashPending, refreshCashContext, submitControlledDocument } from "./src/lib/cash-offline"; import { openCashShiftFromClient } from "./src/lib/cash-shift-opening"; import { getPendingCounts } from "./src/lib/indexed-db"; (${browserSuite.toString()})().catch(error => document.getElementById("result").textContent = JSON.stringify([{ok:false,error:error.message}]));`, resolveDir: rootDir }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "test-navigation", setup(build) { build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "test" })); build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: 'import React from "react"; export default function Link(props) { return React.createElement("a", props); }', resolveDir: rootDir })) } }] })
const css="";
const target=path.join(rootDir,"tmp","shift-report-preview.html")
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}#test-root{margin:0;padding:0}</style><div id="test-root"></div><pre id="result">RUNNING</pre><script>${compiled.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>`)
const profile = path.join(rootDir, "tmp", `shift-report-preview-profile-${Date.now()}`)
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

 for(const layout of [{name:'a4',width:794,height:1123,format:'CARTA'},{name:'80mm',width:302,height:900,format:'80mm'}]){
 await call('Emulation.setDeviceMetricsOverride',{width:layout.width,height:layout.height,deviceScaleFactor:1,mobile:false},sessionId);
 await call('Runtime.evaluate',{expression:'window.previewReportFormat('+JSON.stringify(layout.format)+');document.getElementById("result").style.display="none"'},sessionId);
 await wait(150); const metric=await call('Runtime.evaluate',{expression:"(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,report:document.querySelector('.report').scrollWidth}))()",returnByValue:true},sessionId);
 console.log(layout.name,JSON.stringify(metric.result.value)); const bounds=await call('Runtime.evaluate',{expression:"(()=>{let r=document.querySelector('.report').getBoundingClientRect();return {report:{left:r.left,right:r.right,width:r.width},lines:[...document.querySelectorAll('.line')].slice(0,2).map(x=>({parent:x.getBoundingClientRect().right,strong:x.lastElementChild.getBoundingClientRect().right,text:x.lastElementChild.textContent})),dpr:window.devicePixelRatio}})()",returnByValue:true},sessionId); console.log('bounds',JSON.stringify(bounds.result.value));if(metric.result.value.scroll>metric.result.value.width+1)throw new Error('Desbordamiento horizontal');
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);fs.writeFileSync(path.join(rootDir,'tmp','shift-report-'+layout.name+'.png'),Buffer.from(shot.data,'base64'));
 }

} finally { await call("Browser.close").catch(() => {}); socket.close() }
for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name ?? "Navegador"}${result.error ? ": " + result.error : ""}`)
if (results.some(result => !result.ok)) process.exitCode = 1
