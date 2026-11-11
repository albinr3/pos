"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { cashPending, submitControlledDocument, syncCashOutbox } from "@/lib/cash-offline"
import { FiscalDocumentPreview } from "@/components/app/fiscal-document-preview"
import { FiscalSourceLink, useFiscalSourceAccess } from "@/components/app/fiscal-source-link"

type Supplier = { id: string; name: string; fiscalIdentification?: string | null; fiscalIdentificationCountry?: string | null; fiscalResidence?: string | null }
type Account = { id: string; name: string; type: string; currency: string }
type Line = { description: string; amount: string; isrRate: string }
type ForeignRow = { id: string; currency: string; rate: string; payable: { id: string; description: string; balanceCents: number; supplier: { name: string } } }
type Detail = ForeignRow & { rateDate: string | null; grossDopCents:number; expectedWithheldDopCents:number; payable: ForeignRow["payable"] & {withheldIsrCents:number}; available: Array<{ index: number; description: string; isrRate: string; remainingCents: number; documentedCents: number }>; payments: Array<{ id: string; supplierPayment: { id: string; amountCents: number; paidAt: string; cancelledAt: string | null; fiscalDocuments: Array<{id:string;state:string;type:string;revision:number}> }; snapshot: { grossCents: number; withheldCents: number; netDopCents: number } }> }
type Preview = Parameters<typeof FiscalDocumentPreview>[0]["document"]
type PaymentPreview = { grossCents: number; withheldCents: number; grossDopCents: number; withheldDopCents: number; netDopCents: number; roundingCents: number; currency: string; rate: string; rateDate: string | null }
const field = "w-full rounded border bg-background p-2"
const blank = (): Line => ({ description: "", amount: "", isrRate: "" })
function moneyCents(value:string) {
 // Conservar centavos exactos evita alterar la base del abono por redondeo en el navegador.
 const input=value.trim()
 if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(input)) throw Error("Usa un importe con hasta dos decimales")
 const [whole,fraction=""]=input.split("."),cents=Number(whole)*100+Number(fraction.padEnd(2,"0"))
 if(!Number.isSafeInteger(cents)||cents<1||cents>2147483647) throw Error("Introduce un importe mayor que cero")
 return cents
}
async function call(url: string, method = "GET", payload?: unknown) {
 const response=await fetch(url,{method,cache:"no-store",...(payload === undefined ? {} : {headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})})
 const data=await response.json()
 if(!response.ok){const error=new Error(typeof data.error==="string" ? data.error : data.error?.fields?.[0]?.message ?? data.error?.message ?? "No se pudo procesar la solicitud") as Error & {status:number};error.status=response.status;throw error}
 return data
}
export function ForeignPayments({ actor, enabled, version, canCreate, canPay, canPrepare }: { actor:{id:string;accountId:string}; enabled:boolean; version:number; canCreate:boolean; canPay:boolean; canPrepare:boolean }) {
 const [rows,setRows]=useState<ForeignRow[]>([]),[suppliers,setSuppliers]=useState<Supplier[]>([]),[accounts,setAccounts]=useState<Account[]>([])
 const [nextSkip,setNextSkip]=useState<number|null>(null),[supplierQuery,setSupplierQuery]=useState("")
 const [supplierId,setSupplierId]=useState(""),[description,setDescription]=useState(""),[dueDate,setDueDate]=useState("")
 const [currency,setCurrency]=useState("DOP"),[rate,setRate]=useState(""),[rateDate,setRateDate]=useState(""),[support,setSupport]=useState(""),[declared,setDeclared]=useState(false),[lines,setLines]=useState<Line[]>([blank()])
 const [detail,setDetail]=useState<Detail|null>(null),[amounts,setAmounts]=useState<Record<number,string>>({}),[method,setMethod]=useState("TRANSFERENCIA"),[treasuryId,setTreasuryId]=useState("")
 const [paymentPreview,setPaymentPreview]=useState<PaymentPreview|null>(null),[review,setReview]=useState<{paymentId:string;document:unknown;preview:Preview}|null>(null)
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false)
 const canViewFiscal=useFiscalSourceAccess(),storage=`foreign:${actor.accountId}:${actor.id}`
 async function load(skip=0) { const r=await call(`/api/fiscal/foreign-payments?skip=${skip}&take=50`); setRows(old=>skip ? [...old,...r.data] : r.data);setNextSkip(r.nextSkip) }
 async function open(id:string) { const r=await call(`/api/fiscal/foreign-payments/${encodeURIComponent(id)}`);setDetail(r);setAmounts({});setPaymentPreview(null) }
 useEffect(()=>{ void Promise.all([load(),call("/api/suppliers?take=500").then(r=>setSuppliers(r.data)),call("/api/supplier-payments/options").then(r=>setAccounts(r.accounts))]).catch(e=>setMessage(e.message)) },[])
 const changeLine=(index:number,change:Partial<Line>)=>setLines(old=>old.map((line,i)=>i===index?{...line,...change}:line))
 const allocations=()=>detail?.available.flatMap(line=>{const value=(amounts[line.index]??"").trim();return !value||/^0+(?:\.0{1,2})?$/.test(value)?[]:[{index:line.index,amountCents:moneyCents(value)}]}) ?? []
 async function create() {
  setBusy(true);setMessage("")
  const key=`${storage}:create`
  try {
   if(!navigator.onLine) throw Error("Necesitas conexión para registrar la obligación")
   const payload={expectedPolicyVersion:version,supplierId,description,dueDate,currency:currency.toUpperCase(),...(currency.toUpperCase()!=="DOP"?{rate,rateDate}:{}),declaredDominicanSource:declared,...(support?{supportReference:support}:{}),lines:lines.map(l=>({description:l.description,kind:"SERVICIO",amountCents:moneyCents(l.amount),isrRate:l.isrRate}))}
   const previous=localStorage.getItem(key),saved=previous?JSON.parse(previous):{...payload,operationId:crypto.randomUUID()}
   const comparable={...saved};delete comparable.operationId
   if(JSON.stringify(comparable)!==JSON.stringify(payload)) throw Error("Recupera primero la obligación pendiente con los mismos datos")
   localStorage.setItem(key,JSON.stringify(saved));const result=await call("/api/fiscal/foreign-payments","POST",saved);localStorage.removeItem(key)
   setMessage("Obligación registrada; todavía no existe E47 hasta documentar un pago.");await load();await open(result.id)
  } catch(e) { const status=(e as Error & {status?:number}).status;if(status && status>=400 && status<500 && status!==409)localStorage.removeItem(key);setMessage((e as Error).message) } finally { setBusy(false) }
 }
 async function previewPayment() {
  if(!detail)return;setBusy(true);setMessage("")
  try{setPaymentPreview(await call(`/api/fiscal/foreign-payments/${encodeURIComponent(detail.id)}/payments/preview`,"POST",{allocations:allocations()}))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 async function pay() {
  if(!detail || !paymentPreview)return;setBusy(true);setMessage("")
  const key=`${storage}:payment:${detail.id}`
  try{
   if(!navigator.onLine)throw Error("Necesitas conexión para registrar el pago")
   const queued=(await cashPending()).find(item=>item.kind==="foreignPayment" && item.cashOperation.accountId===actor.accountId && item.cashOperation.userId===actor.id && item.payload.foreignOperationId===detail.id)
   if(queued)throw Error(queued.error ?? "Ya existe un pago pendiente de sincronización")
   const payload={foreignOperationId:detail.id,expectedPolicyVersion:version,expectedNetDopCents:paymentPreview.netDopCents,allocations:allocations(),method,treasuryAccountId:treasuryId}
   const prior=localStorage.getItem(key), saved=prior?JSON.parse(prior):{...payload,operationId:crypto.randomUUID()}
   const comparable={...saved};delete comparable.operationId
   if(JSON.stringify(comparable)!==JSON.stringify(payload))throw Error("Recupera primero el pago pendiente con los mismos datos")
   localStorage.setItem(key,JSON.stringify(saved))
   const result=await submitControlledDocument("foreignPayment",saved,actor)
   if(result?.pending){setMessage(result.error ?? "Pago pendiente de sincronización; no lo registres otra vez.");return}
   if(!result)await call(`/api/fiscal/foreign-payments/${encodeURIComponent(detail.id)}/payments`,"POST",saved)
   localStorage.removeItem(key);setPaymentPreview(null);setMessage("Pago registrado. Revisa su E47 de prueba.");await load();await open(detail.id)
  }catch(e){const status=(e as Error & {status?:number}).status;if(status && status>=400 && status<500 && status!==409)localStorage.removeItem(key);setMessage((e as Error).message)}finally{setBusy(false)}
 }
 async function recover(kind:"create"|"payment") {
  if(kind==="payment" && !detail)return
  setBusy(true);setMessage("")
  const key=kind==="create"?`${storage}:create`:`${storage}:payment:${detail!.id}`
  try {
   const raw=localStorage.getItem(key)
   if(!raw)throw Error("No hay una operación pendiente en este dispositivo")
   const saved=JSON.parse(raw) as Record<string,unknown> & {operationId:string}
   try {
    const result=await call(`/api/fiscal/operations/commercial/${encodeURIComponent(saved.operationId)}`)
    localStorage.removeItem(key);setMessage("Se recuperó el resultado de la operación.");await load();if(kind==="create" && result.result?.id)await open(result.result.id);else if(detail)await open(detail.id);return
   } catch(error) {if((error as Error & {status?:number}).status!==404)throw error}
   if(kind==="create") {
    const result=await call("/api/fiscal/foreign-payments","POST",saved);localStorage.removeItem(key);await load();await open(result.id)
   } else {
    const queued=(await cashPending()).find(item=>item.kind==="foreignPayment" && item.cashOperation.accountId===actor.accountId && item.cashOperation.userId===actor.id && item.payload.foreignOperationId===detail!.id)
    if(queued)throw Error(queued.error ?? "Sincroniza primero el pago pendiente")
    const result=await submitControlledDocument("foreignPayment",saved,actor)
    if(result?.pending){setMessage(result.error ?? "Pago pendiente de sincronización");return}
    if(!result)await call(`/api/fiscal/foreign-payments/${encodeURIComponent(detail!.id)}/payments`,"POST",saved)
    localStorage.removeItem(key);await load();await open(detail!.id)
   }
   setMessage("Operación recuperada.")
  } catch(error) {setMessage((error as Error).message)} finally {setBusy(false)}
 }
 async function previewDocument(paymentId:string) {
  setBusy(true);setMessage("")
  try{const document=await call(`/api/fiscal/foreign-payments/template?paymentId=${encodeURIComponent(paymentId)}`);const preview=await call("/api/fiscal/documents/preview","POST",document);setReview({paymentId,document,preview})}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 async function prepare() {
  if(!review)return;setBusy(true);setMessage("");const key=`${storage}:draft:${review.paymentId}`
  try{
   type Pending={document:unknown;operationId:string;draft?:{id:string;revision:number};prepareOperationId?:string;update?:{operationId:string;expectedRevision:number;document:unknown}}
   const previous=JSON.parse(localStorage.getItem(key)??"null") as Pending|null
   const existing=detail?.payments.find(p=>p.supplierPayment.id===review.paymentId)?.supplierPayment.fiscalDocuments.find(doc=>doc.type==="E47"&&doc.state!=="DESCARTADO")
   if(existing?.state==="PREPARADO_PENDIENTE_CONEXION")throw Error("Este pago ya tiene un E47 preparado")
   let pending:Pending=previous ?? (existing ? {document:review.document,operationId:crypto.randomUUID(),draft:{id:existing.id,revision:existing.revision},update:{operationId:crypto.randomUUID(),expectedRevision:existing.revision,document:review.document}} : {document:review.document,operationId:crypto.randomUUID()})
   if(JSON.stringify(pending.document)!==JSON.stringify(review.document))throw Error("El pago cambió; recupera el borrador pendiente")
   localStorage.setItem(key,JSON.stringify(pending));let draft=pending.draft ?? await call("/api/fiscal/documents","POST",{operationId:pending.operationId,document:pending.document})
   if(pending.update){draft=await call(`/api/fiscal/documents/${encodeURIComponent(draft.id)}`,"PUT",pending.update);pending={document:pending.document,operationId:pending.operationId,draft}}
   const saved={...pending,draft,prepareOperationId:pending.prepareOperationId??crypto.randomUUID()};localStorage.setItem(key,JSON.stringify(saved))
   const result=await call(`/api/fiscal/documents/${encodeURIComponent(draft.id)}/prepare`,"POST",{operationId:saved.prepareOperationId,expectedRevision:draft.revision})
   localStorage.removeItem(key);setReview(null);setMessage(`E47 ${result.eNcf} preparado localmente; pendiente de conexión.`);if(detail)await open(detail.id)
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 const usableAccounts=accounts.filter(a=>a.currency==="DOP" && (method==="EFECTIVO"?a.type==="CAJA":a.type==="BANCO"))
 const foreignSuppliers=suppliers.filter(s=>s.fiscalIdentification && s.fiscalIdentificationCountry && s.fiscalIdentificationCountry!=="DO" && s.fiscalResidence && s.fiscalResidence!=="DO")
 return <section className="grid gap-4 rounded-lg border p-4"><h2 className="text-lg font-semibold">Pago al exterior · E47</h2><p>Las obligaciones y abonos se liquidan en DOP. La moneda original y la tasa declarada se conservan; las cuentas en otras monedas no están disponibles.</p>{message&&<p role="status">{message}</p>}
 {enabled&&canCreate&&<details className="rounded border p-3"><summary>Registrar obligación al exterior</summary><div className="grid gap-3 pt-3"><label>Buscar proveedor<input className={field} value={supplierQuery} onChange={e=>setSupplierQuery(e.target.value)}/></label><button className="rounded border p-2" onClick={()=>void call(`/api/suppliers?take=500&query=${encodeURIComponent(supplierQuery)}`).then(r=>setSuppliers(r.data)).catch(e=>setMessage(e.message))}>Buscar</button><label>Beneficiario no residente<select className={field} value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Selecciona proveedor</option>{foreignSuppliers.map(s=><option key={s.id} value={s.id}>{s.name} · {s.fiscalResidence}</option>)}</select></label><Link className="underline" href="/suppliers">Completar identificación y residencia del proveedor</Link><div className="grid gap-2 md:grid-cols-2"><label>Descripción<input className={field} value={description} onChange={e=>setDescription(e.target.value)}/></label><label>Vencimiento<input type="date" className={field} value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label><label>Moneda de la operación<input maxLength={3} className={field} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>{currency!=="DOP"&&<><label>Tasa a DOP<input className={field} value={rate} onChange={e=>setRate(e.target.value)} inputMode="decimal"/></label><label>Fecha de tasa<input type="date" className={field} value={rateDate} onChange={e=>setRateDate(e.target.value)}/></label></>}<label>Referencia de soporte<input className={field} value={support} onChange={e=>setSupport(e.target.value)}/></label></div><label><input type="checkbox" checked={declared} onChange={e=>setDeclared(e.target.checked)}/> Declaro que corresponde a una renta gravada de fuente dominicana pagadera a un no residente.</label>
 {lines.map((line,i)=><fieldset key={i} className="grid gap-2 rounded border p-2 md:grid-cols-3"><legend>Servicio {i+1}</legend><label>Concepto<input className={field} value={line.description} onChange={e=>changeLine(i,{description:e.target.value})}/></label><label>Bruto en {currency}<input className={field} inputMode="decimal" value={line.amount} onChange={e=>changeLine(i,{amount:e.target.value})}/></label><label>ISR % aplicable<input className={field} inputMode="decimal" value={line.isrRate} onChange={e=>changeLine(i,{isrRate:e.target.value})}/></label>{lines.length>1&&<button onClick={()=>setLines(old=>old.filter((_,j)=>i!==j))}>Quitar servicio</button>}</fieldset>)}<button className="rounded border p-2" onClick={()=>setLines(old=>[...old,blank()])}>Añadir servicio</button><button className="rounded border p-2" disabled={busy} onClick={()=>void create()}>Registrar obligación</button><button className="rounded border p-2" disabled={busy} onClick={()=>void recover("create")}>Recuperar obligación pendiente</button></div></details>}
 <div className="grid gap-2"><h3>Obligaciones al exterior</h3>{rows.map(row=><button key={row.id} className="rounded border p-2 text-left" onClick={()=>void open(row.id)}>{row.payable.supplier.name} · {row.payable.description} · pendiente RD$ {(row.payable.balanceCents/100).toFixed(2)}</button>)}{nextSkip!==null&&<button className="rounded border p-2" onClick={()=>void load(nextSkip)}>Cargar más</button>}</div>
 {detail&&<div className="grid gap-3 rounded border p-3"><h3 className="font-medium">{detail.payable.description} · {detail.currency}</h3><p>Bruto RD$ {(detail.grossDopCents/100).toFixed(2)} · ISR previsto RD$ {(detail.expectedWithheldDopCents/100).toFixed(2)} · ISR retenido RD$ {(detail.payable.withheldIsrCents/100).toFixed(2)}</p><p>Saldo neto RD$ {(detail.payable.balanceCents/100).toFixed(2)} · Tasa {detail.rate}{detail.rateDate?` del ${detail.rateDate}`:""}</p><h4>Base pendiente por concepto</h4>{detail.available.map(line=><label key={line.index}>{line.description} · disponible {(line.remainingCents/100).toFixed(2)} {detail.currency} · documentado {(line.documentedCents/100).toFixed(2)} · ISR {line.isrRate} %<input className={field} inputMode="decimal" value={amounts[line.index]??""} disabled={!enabled||!canPay} onChange={e=>{setAmounts(old=>({...old,[line.index]:e.target.value}));setPaymentPreview(null)}} placeholder="Base de este abono"/></label>)}
 {enabled&&canPay&&detail.payable.balanceCents>0&&<><label>Método<select className={field} value={method} onChange={e=>{setMethod(e.target.value);setTreasuryId("");setPaymentPreview(null)}}><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="OTRO">Otro</option></select></label><label>Cuenta DOP<select className={field} value={treasuryId} onChange={e=>setTreasuryId(e.target.value)}><option value="">Selecciona cuenta</option>{usableAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><button className="rounded border p-2" disabled={busy} onClick={()=>void previewPayment()}>Revisar abono</button>{paymentPreview&&<div className="grid gap-1 rounded border p-2"><p>Base {(paymentPreview.grossCents/100).toFixed(2)} {paymentPreview.currency} · ISR {(paymentPreview.withheldCents/100).toFixed(2)} {paymentPreview.currency}</p><p>Bruto RD$ {(paymentPreview.grossDopCents/100).toFixed(2)} · ISR RD$ {(paymentPreview.withheldDopCents/100).toFixed(2)} · <strong>Pago neto RD$ {(paymentPreview.netDopCents/100).toFixed(2)}</strong></p>{paymentPreview.roundingCents!==0&&<p>Ajuste acumulado de redondeo: RD$ {(paymentPreview.roundingCents/100).toFixed(2)}</p>}<button className="rounded border p-2" disabled={busy||!treasuryId} onClick={()=>void pay()}>Confirmar pago</button></div>}</>}
 {canPay&&<button className="rounded border p-2" disabled={busy} onClick={()=>void recover("payment")}>Recuperar pago pendiente</button>}<h4>Pagos relacionados</h4>{detail.payments.map(payment=><div key={payment.id} className="flex flex-wrap items-center gap-2 rounded border p-2"><span>RD$ {(payment.supplierPayment.amountCents/100).toFixed(2)} · {new Date(payment.supplierPayment.paidAt).toLocaleDateString("es-DO")}{payment.supplierPayment.cancelledAt?" · Anulado":""}</span><FiscalSourceLink allowed={canViewFiscal} kind="SUPPLIER_PAYMENT" id={payment.supplierPayment.id}/>{payment.supplierPayment.fiscalDocuments.filter(doc=>doc.state!=="DESCARTADO").map(doc=><span key={doc.id}>E47 · {doc.state}</span>)}{enabled&&canPrepare&&!payment.supplierPayment.cancelledAt&&!payment.supplierPayment.fiscalDocuments.some(doc=>doc.state==="PREPARADO_PENDIENTE_CONEXION")&&<button className="rounded border p-1" onClick={()=>void previewDocument(payment.supplierPayment.id)}>{payment.supplierPayment.fiscalDocuments.some(doc=>doc.state!=="DESCARTADO")?"Reanudar E47":"Revisar E47"}</button>}</div>)}</div>}
 {review&&<div className="grid gap-2 rounded border p-3"><FiscalDocumentPreview document={review.preview}/><button className="rounded border p-2" disabled={busy} onClick={()=>void prepare()}>Preparar E47 de prueba</button></div>}
 <button className="rounded border p-2" onClick={()=>void syncCashOutbox().then(()=>load()).then(()=>setMessage("Sincronización terminada")).catch(e=>setMessage(e.message))}>Sincronizar pendientes</button>
 </section>
}
