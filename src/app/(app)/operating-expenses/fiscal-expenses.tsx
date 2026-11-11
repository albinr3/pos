"use client"

import { useEffect, useState } from "react"
import { cashPending, submitControlledDocument, syncCashOutbox } from "@/lib/cash-offline"
import { FiscalDocumentPreview } from "@/components/app/fiscal-document-preview"
import { listTreasuryAccounts } from "../treasury/actions"

type Account = Awaited<ReturnType<typeof listTreasuryAccounts>>[number]
type Line = { description: string; kind: "BIEN" | "SERVICIO"; amount: string; taxTreatment: string; withholdings?: unknown[] }
type Expense = { id: string; description: string; amountCents: number; updatedAt: string; fundingSource?: string; fiscalDocuments?:Array<{id:string;type:string;state:string;revision:number}>; fiscalExpenseDetails?: { employee?: { name?: string; identification?: string; userId?: string }; beneficiary?: string | null; supportReferences?: string[]; eligibleMinorExpense?: boolean; lines?: Array<{description:string;kind:Line["kind"];amountCents:number;taxTreatment:string;withholdings?:unknown[]}> } }
type Preview = Parameters<typeof FiscalDocumentPreview>[0]["document"]
const inputClass = "w-full rounded border bg-background p-2"
const emptyLine = (): Line => ({ description: "", kind: "SERVICIO", amount: "", taxTreatment: "EXENTO" })
function moneyCents(value:string) {
  // No redondear silenciosamente un tercer decimal al registrar o reembolsar dinero.
  const input=value.trim()
  if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(input)) throw Error("Usa un importe con hasta dos decimales")
  const [whole,fraction=""]=input.split("."), cents=Number(whole)*100+Number(fraction.padEnd(2,"0"))
  if(!Number.isSafeInteger(cents)||cents<1||cents>2147483647) throw Error("Introduce un importe mayor que cero")
  return cents
}
async function request(url: string, method = "GET", data?: unknown) {
  const response = await fetch(url, { method, cache: "no-store", ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) })
  const result = await response.json()
  if (!response.ok) { const error = new Error(typeof result.error === "string" ? result.error : result.error?.fields?.[0]?.message ?? result.error?.message ?? "No se pudo completar la operación") as Error & { status: number }; error.status = response.status; throw error }
  return result
}

export function FiscalExpenses({ actor, enabled, version, canPrepare }: { actor: { id: string; accountId: string }; enabled: boolean; version: number; canPrepare: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [nextSkip, setNextSkip] = useState<number|null>(null)
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [notes, setNotes] = useState("")
  const [expenseDate, setExpenseDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santo_Domingo" }))
  const [fundingSource, setFundingSource] = useState<"COMPANY" | "EMPLOYEE" | "PETTY_CASH">("EMPLOYEE")
  const [employee, setEmployee] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [employeeUserId, setEmployeeUserId] = useState("")
  const [beneficiary, setBeneficiary] = useState("")
  const [support, setSupport] = useState("")
  const [eligible, setEligible] = useState(false)
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [method, setMethod] = useState("EFECTIVO")
  const [treasuryId, setTreasuryId] = useState("")
  const [selected, setSelected] = useState("")
  const [balance, setBalance] = useState<{ balanceCents: number; data: Array<{ id: string; amountCents: number; createdAt: string }> } | null>(null)
  const [amount, setAmount] = useState("")
  const [review, setReview] = useState<{ id: string; document: unknown; preview: Preview } | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{id:string;updatedAt:string}|null>(null)
  const key = `expense:${actor.accountId}:${actor.id}`
  async function load(skip=0) {
    const result = await request(`/api/operating-expenses?take=100&skip=${skip}`)
    const items=(result.data as Expense[]).filter(item => !!item.fiscalExpenseDetails)
    setExpenses(old=>skip?[...old,...items]:items);setNextSkip(result.nextSkip)
  }
  async function loadBalance(id: string) { setSelected(id); setBalance(await request(`/api/operating-expenses/${encodeURIComponent(id)}/settlements`)) }
  useEffect(() => { void Promise.all([load(), listTreasuryAccounts().then(setAccounts)]).catch(e => setMessage(e.message)) }, [])
  function updateLine(index: number, update: Partial<Line>) { setLines(items => items.map((item, i) => i === index ? { ...item, ...update } : item)) }
  function editExpense(item: Expense) {
    const details=item.fiscalExpenseDetails
    if(!details?.lines) return
    setEditing({id:item.id,updatedAt:item.updatedAt});setDescription(item.description);setFundingSource((item.fundingSource ?? "EMPLOYEE") as typeof fundingSource)
    setEmployee(details.employee?.name ?? "");setEmployeeId(details.employee?.identification ?? "");setEmployeeUserId(details.employee?.userId ?? "");setBeneficiary(details.beneficiary ?? "");setSupport((details.supportReferences ?? []).join("\n"));setEligible(details.eligibleMinorExpense === true)
    setLines(details.lines.map(line=>({description:line.description,kind:line.kind,amount:(line.amountCents/100).toFixed(2),taxTreatment:line.taxTreatment,...(line.withholdings?.length?{withholdings:line.withholdings}:{})})))
    setMessage("Puedes corregir los datos de revisión conservando el importe original.")
  }
  async function command(kind: "fiscalExpense" | "employeeExpenseSettlement", path: string, payload: Record<string, unknown>, storage: string) {
    if (!navigator.onLine) throw new Error("Necesitas conexión para registrar el gasto o reembolso")
    const pendingQueue = (await cashPending()).find(item => item.cashOperation.accountId === actor.accountId && item.cashOperation.userId === actor.id && item.kind === kind && (kind !== "employeeExpenseSettlement" || item.payload.expenseId === payload.expenseId))
    if (pendingQueue) throw new Error(pendingQueue.error ?? "Hay una operación pendiente. Sincronízala antes de continuar.")
    const previous = localStorage.getItem(storage)
    const saved = previous ? JSON.parse(previous) as Record<string, unknown> : { ...payload, operationId: crypto.randomUUID() }
    const storedPayload = { ...saved }
    delete storedPayload.operationId
    if (JSON.stringify(storedPayload) !== JSON.stringify(payload)) throw new Error("Recupera primero la operación pendiente con los mismos datos")
    localStorage.setItem(storage, JSON.stringify(saved))
    try {
      const controlled = await submitControlledDocument(kind, saved, actor)
      if (controlled?.pending) { setMessage(controlled.error ?? "Operación pendiente de sincronización; no la registres otra vez."); return false }
      if (!controlled) await request(path, "POST", kind === "fiscalExpense" ? { fiscalExpense: saved } : saved)
      localStorage.removeItem(storage)
      return true
    } catch (error) {
      const status = (error as Error & { status?: number }).status
      // Un error de red puede ocultar un commit: conservar la misma clave hasta recuperarlo.
      if (status && status >= 400 && status < 500 && status !== 409) localStorage.removeItem(storage)
      throw error
    }
  }
  async function recover(storage: string, kind: "fiscalExpense" | "employeeExpenseSettlement" | "fiscalExpenseRevision", id?: string) {
    setBusy(true);setMessage("")
    try {
      const raw=localStorage.getItem(storage)
      if(!raw) throw Error("No hay una operación pendiente en este dispositivo")
      const saved=JSON.parse(raw) as Record<string,unknown> & {operationId:string}
      try {
        await request(`/api/fiscal/operations/commercial/${encodeURIComponent(saved.operationId)}`)
        localStorage.removeItem(storage);setMessage("Se recuperó el resultado de la operación.");await load();if(id && kind==="employeeExpenseSettlement")await loadBalance(id);return
      } catch(error) { if((error as Error & {status?:number}).status!==404) throw error }
      if(kind==="fiscalExpenseRevision") {
        await request(`/api/operating-expenses/${encodeURIComponent(id!)}`,"PUT",{fiscalExpense:saved})
        localStorage.removeItem(storage)
      } else {
        const payload:Record<string,unknown>={...saved};delete payload.operationId
        const path=kind==="fiscalExpense"?"/api/operating-expenses":`/api/operating-expenses/${encodeURIComponent(id!)}/settlements`
        if(!await command(kind,path,payload,storage))return
      }
      setMessage("Operación recuperada.");await load();if(id && kind==="employeeExpenseSettlement")await loadBalance(id)
    } catch(error) {setMessage((error as Error).message)} finally {setBusy(false)}
  }
  async function createExpense() {
    setBusy(true); setMessage("")
    try {
      const details = { expectedPolicyVersion: version, employee: { name: employee, ...(employeeId ? { identification: employeeId } : {}), ...(employeeUserId ? {userId:employeeUserId} : {}) }, ...(beneficiary ? { beneficiary } : {}), supportReferences: support.split("\n").map(x => x.trim()).filter(Boolean), eligibleMinorExpense: eligible, lines: lines.map(line => ({ description: line.description, kind: line.kind, amountCents: moneyCents(line.amount), taxTreatment: line.taxTreatment, ...(line.withholdings?.length ? {withholdings:line.withholdings} : {}) })) }
      if(editing) {
        const storage=`${key}:edit:${editing.id}`,payload={...details,expectedUpdatedAt:editing.updatedAt},previous=localStorage.getItem(storage),saved=previous?JSON.parse(previous):{...payload,operationId:crypto.randomUUID()}
        const comparable={...saved};delete comparable.operationId
        if(JSON.stringify(comparable)!==JSON.stringify(payload)) throw Error("Recupera primero la revisión pendiente con los mismos datos")
        localStorage.setItem(storage,JSON.stringify(saved))
        try { await request(`/api/operating-expenses/${encodeURIComponent(editing.id)}`,"PUT",{fiscalExpense:saved}) } catch(error) {const status=(error as Error & {status?:number}).status;if(status&&status>=400&&status<500&&status!==409)localStorage.removeItem(storage);throw error}
        localStorage.removeItem(storage);setEditing(null);setMessage("Detalle actualizado; revisa de nuevo cualquier borrador anterior.");await load()
      } else {
        const payload = { ...details, description, ...(category ? {category} : {}), ...(notes ? {notes} : {}), expenseDate, fundingSource, ...(fundingSource !== "EMPLOYEE" ? { treasuryAccountId: treasuryId, paymentMethod: method } : {}) }
        if (await command("fiscalExpense", "/api/operating-expenses", payload, `${key}:create`)) { setDescription(""); setLines([emptyLine()]); setMessage("Gasto registrado. Revisa su elegibilidad antes de preparar E43."); await load() }
      }
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  async function settle() {
    if (!selected) return
    setBusy(true); setMessage("")
    try {
      const payload = { expenseId: selected, amountCents: moneyCents(amount), method, treasuryAccountId: treasuryId }
      if (await command("employeeExpenseSettlement", `/api/operating-expenses/${encodeURIComponent(selected)}/settlements`, payload, `${key}:settlement:${selected}`)) { setAmount(""); setMessage("Reembolso registrado."); await loadBalance(selected) }
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  async function preview(id: string) {
    setBusy(true); setMessage("")
    try { const document = await request(`/api/fiscal/expenses/template?id=${encodeURIComponent(id)}`); const result = await request("/api/fiscal/documents/preview", "POST", document); setReview({ id, document, preview: result }) } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  async function prepare() {
    if (!review) return
    setBusy(true); setMessage("")
    const draftKey = `${key}:draft:${review.id}`
    try {
      type Pending = { document: unknown; operationId: string; draft?: { id: string; revision: number }; prepareOperationId?: string; updateOperationId?: string; nextDocument?: unknown }
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as Pending | null
      const existing=expenses.find(expense=>expense.id===review.id)?.fiscalDocuments?.find(doc=>doc.type==="E43" && doc.state!=="DESCARTADO")
      if(existing?.state==="PREPARADO_PENDIENTE_CONEXION") throw Error("Este gasto ya tiene un E43 preparado")
      let pending: Pending = saved ?? (existing ? {document:null,operationId:crypto.randomUUID(),draft:{id:existing.id,revision:existing.revision}} : { document: review.document, operationId: crypto.randomUUID() })
      localStorage.setItem(draftKey, JSON.stringify(pending))
      let draft = pending.draft ?? await request("/api/fiscal/documents", "POST", { operationId: pending.operationId, document: pending.document })
      pending = {...pending,draft};localStorage.setItem(draftKey, JSON.stringify(pending))
      if (JSON.stringify(pending.document) !== JSON.stringify(review.document)) {
        if (pending.prepareOperationId) {
          let previous: {status:string;result?:{eNcf?:string}} | null = null
          try { previous = await request(`/api/fiscal/operations/${encodeURIComponent(pending.prepareOperationId)}`) } catch (error) { if ((error as Error & {status?:number}).status !== 404) throw error }
          if (previous?.status === "COMPLETED") { localStorage.removeItem(draftKey);setReview(null);setMessage(`El E43 ${previous.result?.eNcf ?? ""} ya fue preparado.`);return }
          if (previous?.status === "PENDING") throw new Error("La preparación anterior sigue pendiente; consulta su resultado antes de editar")
        }
        if (pending.nextDocument && JSON.stringify(pending.nextDocument) !== JSON.stringify(review.document)) throw new Error("Recupera primero la revisión anterior del borrador")
        pending={...pending,prepareOperationId:undefined,updateOperationId:pending.updateOperationId ?? crypto.randomUUID(),nextDocument:review.document}
        localStorage.setItem(draftKey, JSON.stringify(pending))
        // Recuperar la misma revisión tras una respuesta perdida evita crear otra versión.
        draft=await request(`/api/fiscal/documents/${encodeURIComponent(draft.id)}`,"PUT",{operationId:pending.updateOperationId,expectedRevision:draft.revision,document:pending.nextDocument})
        pending={document:review.document,operationId:pending.operationId,draft}
      }
      const current = { ...pending, draft, prepareOperationId: pending.prepareOperationId ?? crypto.randomUUID() }
      localStorage.setItem(draftKey, JSON.stringify(current))
      const result = await request(`/api/fiscal/documents/${encodeURIComponent(draft.id)}/prepare`, "POST", { operationId: current.prepareOperationId, expectedRevision: draft.revision })
      localStorage.removeItem(draftKey); setReview(null); setMessage(`E43 ${result.eNcf} preparado localmente; pendiente de conexión.`); await load()
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  const availableAccounts = accounts.filter(a => a.isActive && a.currency === "DOP" && (method === "EFECTIVO" ? a.type === "CAJA" : a.type === "BANCO"))
  return <section className="grid gap-4 rounded-lg border p-4"><h2 className="text-lg font-semibold">Gastos del personal y reembolsos</h2><p>Preparación local; pendiente de conexión fiscal. El reembolso no registra un segundo gasto.</p>
    {message && <p role="status">{message}</p>}
    {enabled && <div className="grid gap-3 rounded border p-3"><h3 className="font-medium">{editing ? "Revisar detalle del gasto" : "Registrar gasto"}</h3><div className="grid gap-2 md:grid-cols-2"><label>Descripción<input className={inputClass} disabled={!!editing} value={description} onChange={e => setDescription(e.target.value)}/></label><label>Fecha<input type="date" className={inputClass} disabled={!!editing} value={expenseDate} onChange={e => setExpenseDate(e.target.value)}/></label>{!editing&&<><label>Categoría (opcional)<input className={inputClass} value={category} onChange={e=>setCategory(e.target.value)}/></label><label>Notas (opcional)<input className={inputClass} value={notes} onChange={e=>setNotes(e.target.value)}/></label></>}<label>Empleado<input className={inputClass} value={employee} onChange={e => setEmployee(e.target.value)}/></label><label>Identificación del empleado (opcional)<input className={inputClass} value={employeeId} onChange={e => setEmployeeId(e.target.value)}/></label><label>ID de usuario empleado (opcional)<input className={inputClass} value={employeeUserId} onChange={e => setEmployeeUserId(e.target.value)}/></label><label>Beneficiario (opcional)<input className={inputClass} value={beneficiary} onChange={e => setBeneficiary(e.target.value)}/></label><label>Fondos<select className={inputClass} disabled={!!editing} value={fundingSource} onChange={e => setFundingSource(e.target.value as typeof fundingSource)}><option value="EMPLOYEE">Adelanto personal</option><option value="COMPANY">Pago de la empresa</option><option value="PETTY_CASH">Caja chica</option></select></label></div>
      <label>Referencias de soportes, una por línea<textarea className={inputClass} value={support} onChange={e => setSupport(e.target.value)}/></label><label><input type="checkbox" checked={eligible} onChange={e => setEligible(e.target.checked)}/> Declaro que el gasto fue realizado por personal en actividades de trabajo y es elegible para revisión E43.</label>{!eligible && <p>Si corresponde a una compra o servicio del proveedor, revísalo en <a className="underline" href="/purchases">Compras</a> o <a className="underline" href="/ap">Cuentas por pagar</a>.</p>}
      {lines.map((line, i) => <fieldset key={i} className="grid gap-2 rounded border p-2 md:grid-cols-4"><legend>Concepto {i + 1}</legend><label>Descripción<input className={inputClass} value={line.description} onChange={e => updateLine(i,{description:e.target.value})}/></label><label>Clase<select className={inputClass} value={line.kind} onChange={e => updateLine(i,{kind:e.target.value as Line["kind"]})}><option value="SERVICIO">Servicio</option><option value="BIEN">Bien</option></select></label><label>Importe RD$<input className={inputClass} inputMode="decimal" value={line.amount} onChange={e => updateLine(i,{amount:e.target.value})}/></label><label>Tratamiento<select className={inputClass} value={line.taxTreatment} onChange={e => updateLine(i,{taxTreatment:e.target.value})}><option value="EXENTO">Exento</option><option value="GRAVADO_18">ITBIS 18 %</option><option value="GRAVADO_16">ITBIS 16 %</option><option value="TASA_CERO">Tasa cero</option></select></label>{line.withholdings?.length ? <div className="md:col-span-4"><p>Retenciones registradas: {JSON.stringify(line.withholdings)}</p><button type="button" className="underline" onClick={() => { if(confirm("¿Confirmas retirar estas retenciones del detalle?")) updateLine(i,{withholdings:[]}) }}>Retirar retenciones tras revisión</button></div> : null}{lines.length > 1 && <button type="button" onClick={() => setLines(items => items.filter((_, index) => index !== i))}>Quitar concepto</button>}</fieldset>)}
      <button type="button" className="rounded border p-2" onClick={() => setLines(items => [...items,emptyLine()])}>Añadir concepto</button><button type="button" disabled={busy} className="rounded border p-2" onClick={() => void createExpense()}>{editing ? "Guardar revisión" : "Registrar gasto"}</button>{editing?<><button type="button" className="rounded border p-2" onClick={()=>void recover(`${key}:edit:${editing.id}`,"fiscalExpenseRevision",editing.id)}>Recuperar revisión pendiente</button><button type="button" className="rounded border p-2" onClick={()=>{setEditing(null);setDescription("");setLines([emptyLine()])}}>Cancelar revisión</button></>:<button type="button" className="rounded border p-2" onClick={()=>void recover(`${key}:create`,"fiscalExpense")}>Recuperar registro pendiente</button>}</div>}
    <div className="grid gap-2 md:grid-cols-2"><label>Método de pago<select className={inputClass} value={method} onChange={e => { setMethod(e.target.value); setTreasuryId("") }}><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option><option value="TARJETA">Tarjeta</option><option value="OTRO">Otro</option></select></label><label>Cuenta para pago o reembolso<select className={inputClass} value={treasuryId} onChange={e => setTreasuryId(e.target.value)}><option value="">Selecciona cuenta</option>{availableAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
    <div className="grid gap-2"><h3 className="font-medium">Gastos registrados</h3>{expenses.map(expense => <div key={expense.id} className="flex flex-wrap items-center gap-2 rounded border p-2"><span>{expense.description} · RD$ {(expense.amountCents/100).toFixed(2)} · {expense.fiscalExpenseDetails?.employee?.name}</span>{expense.fiscalDocuments?.map(doc=><span key={doc.id}>E43 · {doc.state}</span>)}{enabled&&!expense.fiscalDocuments?.some(doc=>doc.state==="PREPARADO_PENDIENTE_CONEXION")&&<button className="rounded border p-1" onClick={()=>editExpense(expense)}>Editar detalle</button>}{expense.fundingSource === "EMPLOYEE" && <button className="rounded border p-1" onClick={() => void loadBalance(expense.id).catch(error=>setMessage(error.message))}>Reembolsos</button>}{enabled && canPrepare && !expense.fiscalDocuments?.some(doc=>doc.state==="PREPARADO_PENDIENTE_CONEXION") && <button className="rounded border p-1" onClick={() => void preview(expense.id)}>Revisar E43</button>}</div>)}{nextSkip!==null&&<button className="rounded border p-2" onClick={()=>void load(nextSkip)}>Cargar más</button>}</div>
    {balance && <div className="grid gap-2 rounded border p-3"><h3>Saldo pendiente RD$ {(balance.balanceCents/100).toFixed(2)}</h3>{balance.data.map(row => <p key={row.id}>Reembolso RD$ {(row.amountCents/100).toFixed(2)} · {new Date(row.createdAt).toLocaleDateString("es-DO")}</p>)}<label>Importe a reembolsar<input className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"/></label><button className="rounded border p-2" disabled={busy || balance.balanceCents <= 0} onClick={() => void settle()}>Registrar reembolso</button><button className="rounded border p-2" disabled={busy} onClick={()=>void recover(`${key}:settlement:${selected}`,"employeeExpenseSettlement",selected)}>Recuperar reembolso pendiente</button></div>}
    {review && <div className="grid gap-2 rounded border p-3"><FiscalDocumentPreview document={review.preview}/><button className="rounded border p-2" disabled={busy} onClick={() => void prepare()}>Preparar E43 de prueba</button></div>}
    <button className="rounded border p-2" onClick={() => void syncCashOutbox().then(()=>load()).then(() => setMessage("Sincronización terminada")).catch(e => setMessage(e.message))}>Sincronizar pendientes</button>
  </section>
}
