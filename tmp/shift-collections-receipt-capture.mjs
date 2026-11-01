import fs from 'node:fs'; import path from 'node:path'; import {spawn} from 'node:child_process'; import {pathToFileURL} from 'node:url'; const rootDir=process.cwd(); const browser='C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = path.join(rootDir, "tmp", `shift-collections-preview-profile-${Date.now()}`)
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

try {
 const {targetId}=await call('Target.createTarget',{url:pathToFileURL(path.join(rootDir,'tmp','shift-collections-receipt.html')).href});
 const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:1200,deviceScaleFactor:1,mobile:false},sessionId);
 await call('Emulation.setEmulatedMedia',{media:'print'},sessionId);
 for(let i=0;i<100;i++){const state=await call('Runtime.evaluate',{expression:'document.readyState',returnByValue:true},sessionId);if(state.result.value==='complete')break;await wait(30);}
 const metric=await call('Runtime.evaluate',{expression:'(()=>{const m=document.querySelector("main");return {width:m.clientWidth,scroll:m.scrollWidth,text:m.textContent}})()',returnByValue:true},sessionId);
 if(metric.result.value.scroll>metric.result.value.width+1)throw new Error('Desbordamiento del ticket');
 if(!metric.result.value.text.includes('Total cobrado: RD$600.00'))throw new Error('Falta el total cobrado en el ticket');
 console.log('PASS Ticket de 80 mm, ancho '+metric.result.value.width+' px, sin desbordamientos');
 const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);
 fs.writeFileSync(path.join(rootDir,'tmp','shift-collections-receipt.png'),Buffer.from(screenshot.data,'base64'));
} finally {await call('Browser.close').catch(()=>{});socket.close();}