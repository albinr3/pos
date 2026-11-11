"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cashPending, submitControlledDocument, syncCashOutbox } from "@/lib/cash-offline"
import { formatRD } from "@/lib/money"

type Actor = { id: string; accountId: string }
type Treasury = { id: string; name: string }
type Line = { description: string; kind: "SERVICIO" | "RECARGO"; unit: string; quantity: string; unitPrice: string; taxTreatment: string; priceIncludesTax: boolean }
type Command = { originalDocumentId: string; expectedPolicyVersion: number; issueDate: string; reason: string; payment: { type: "CONTADO" | "CREDITO"; dueDate?: string }; lines: Line[] }
type Preview = { calculated: { totals: { gross: string; tax: string }; buyer: { name?: string } | null; warnings: string[] } }
type Draft = { id: string; state: string; revision: number; fiscalDocumentId: string | null; input: Command; snapshot: unknown }
const field = "w-full rounded border bg-background px-2 py-1"
const newLine = (): Line => ({ description: "", kind: "SERVICIO", unit: "UNIDAD", quantity: "1", unitPrice: "0.00", taxTreatment: "GRAVADO_18", priceIncludesTax: true })
async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(result.error?.fields?.[0]?.message ?? result.error?.message ?? result.error ?? "No se pudo procesar la solicitud"), { status: response.status })
  return result
}

export function DebitNoteForm({ actor, version, initialOriginalId, initialNoteId, treasuryAccounts }: { actor: Actor; version: number; initialOriginalId: string; initialNoteId: string; treasuryAccounts: Treasury[] }) {
  const router = useRouter()
  const [command, setCommand] = useState<Command>({ originalDocumentId: initialOriginalId, expectedPolicyVersion: version, issueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), reason: "", payment: { type: "CONTADO" }, lines: [newLine()] })
  const [draft, setDraft] = useState<Draft | null>(null), [preview, setPreview] = useState<Preview | null>(null)
  const [notes, setNotes] = useState<Draft[]>([]), [editing, setEditing] = useState(!initialNoteId)
  const [nextSkip, setNextSkip] = useState<number | null>(null)
  const [hasPendingSave, setHasPendingSave] = useState(false)
  const [method, setMethod] = useState("EFECTIVO"), [treasuryId, setTreasuryId] = useState("")
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false)
  // Separar creación y edición impide enviar un guardado pendiente a otra nota de la misma factura.
  const key = `fiscal-debit:save:${actor.accountId}:${actor.id}:${command.originalDocumentId}:${draft?.id ?? "new"}`
  const validationKey = (id: string) => `fiscal-debit:validate:${actor.accountId}:${actor.id}:${id}`
  const discardKey = (id: string) => `fiscal-debit:discard:${actor.accountId}:${actor.id}:${id}`
  async function loadList(skip = 0) { const result = await request(`/api/debit-notes?skip=${skip}&take=100`); const incoming = result.data as Draft[]; setNotes(previous => skip ? [...new Map<string, Draft>([...previous, ...incoming].map(note => [note.id, note] as const)).values()] : incoming); setNextSkip(result.nextSkip) }
  useEffect(() => {
    void loadList().catch((e: Error) => setError(e.message))
    if (initialNoteId) void request(`/api/debit-notes/${encodeURIComponent(initialNoteId)}`).then((result: Draft) => { setDraft(result); setCommand(result.input); setEditing(result.state === "BORRADOR"); setPreview({ calculated: result.snapshot as Preview["calculated"] }) }).catch((e: Error) => setError(e.message))
  }, [initialNoteId])
  useEffect(() => {
    const pending = localStorage.getItem(key)
    setHasPendingSave(Boolean(pending))
    if (!pending) return
    try {
      const saved = JSON.parse(pending) as { note?: Command }
      // Tras recargar, recuperar exactamente el comando cuyo resultado pudo perderse.
      if (saved.note) { setCommand(saved.note); setEditing(true); setPreview(null); setMessage("Hay un guardado pendiente. Revisa y previsualiza los datos para recuperarlo.") }
    } catch { setError("No se pudo leer el guardado pendiente; conserva el registro para revisión.") }
  }, [key])
  function change(next: Command) { setCommand(next); setPreview(null) }
  function line(index: number, next: Partial<Line>) { change({ ...command, lines: command.lines.map((item, i) => i === index ? { ...item, ...next } : item) }) }
  async function review() {
    setBusy(true); setError(""); setMessage("")
    try { setPreview(await request("/api/debit-notes/preview", "POST", command)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function saveAndValidate() {
    setBusy(true); setError(""); setMessage("")
    let pendingKey = key
    try {
      if (!preview) throw new Error("Previsualiza el cargo antes de continuar")
      const pendingText = localStorage.getItem(key)
      let pending = pendingText ? JSON.parse(pendingText) : { operationId: crypto.randomUUID(), note: command, ...(draft ? { expectedRevision: draft.revision } : {}) }
      if (JSON.stringify(pending.note) !== JSON.stringify(command)) throw new Error("Recupera primero el guardado pendiente con los mismos datos")
      localStorage.setItem(key, JSON.stringify(pending))
      setHasPendingSave(true)
      const saved = await request(draft ? `/api/debit-notes/${encodeURIComponent(draft.id)}` : "/api/debit-notes", draft ? "PUT" : "POST", pending)
      localStorage.removeItem(key)
      setHasPendingSave(false)
      const next: Draft = { id: saved.id, state: saved.state, revision: saved.revision, fiscalDocumentId: null, input: command, snapshot: saved.preview.calculated }
      setDraft(next); setEditing(false)
      const validateKey = validationKey(next.id)
      let existing = localStorage.getItem(validateKey)
      // Una validación anterior no puede reutilizarse después de incrementar la revisión del borrador.
      if (existing && JSON.parse(existing).expectedRevision !== next.revision) { localStorage.removeItem(validateKey); existing = null }
      pendingKey = validateKey
      pending = existing ? JSON.parse(existing) : { operationId: crypto.randomUUID(), expectedRevision: next.revision }
      localStorage.setItem(validateKey, JSON.stringify(pending))
      const validated = await request(`/api/debit-notes/${encodeURIComponent(next.id)}/validate`, "POST", pending)
      localStorage.removeItem(validateKey); setDraft({ ...next, state: validated.state }); setPreview(validated.preview)
      setMessage("Nota de débito validada. Confirma el cargo para registrar su efecto financiero."); await loadList()
    } catch (e) {
      // Solo un rechazo confirmado libera la clave; un fallo de red puede ocultar un commit exitoso.
      const status = (e as Error & { status?: number }).status
      if (status && status >= 400 && status < 500) { localStorage.removeItem(pendingKey); if (pendingKey === key) setHasPendingSave(false) }
      setError((e as Error).message)
    } finally { setBusy(false) }
  }
  async function validateExisting() {
    if (!draft) return
    setBusy(true); setError("")
    try {
      const storage = validationKey(draft.id), prior = localStorage.getItem(storage)
      const payload = prior ? JSON.parse(prior) : { operationId: crypto.randomUUID(), expectedRevision: draft.revision }
      localStorage.setItem(storage, JSON.stringify(payload))
      const result = await request(`/api/debit-notes/${encodeURIComponent(draft.id)}/validate`, "POST", payload)
      localStorage.removeItem(storage); setDraft({ ...draft, state: result.state }); setPreview(result.preview); setEditing(false)
    } catch (e) { const status = (e as Error & { status?: number }).status; if (status && status >= 400 && status < 500) localStorage.removeItem(validationKey(draft.id)); setError((e as Error).message) } finally { setBusy(false) }
  }
  async function confirm() {
    // Confirmar mientras se editan campos mostraría importes que todavía no están guardados.
    if (!draft || draft.state !== "VALIDADO" || editing) return
    setBusy(true); setError(""); setMessage("")
    try {
      const pending = (await cashPending()).find(item => item.cashOperation.accountId === actor.accountId && item.cashOperation.userId === actor.id && item.payload.adjustmentId === draft.id)
      if (pending) throw new Error(pending.error ?? "Ya existe una operación pendiente; sincronízala antes de continuar")
      const latest: Draft = await request(`/api/debit-notes/${encodeURIComponent(draft.id)}`)
      if (latest.state === "PREPARADO_PENDIENTE_CONEXION") { router.push(`/invoices/fiscal/${latest.fiscalDocumentId}`); return }
      if (command.payment.type === "CONTADO" && !treasuryId) throw new Error("Selecciona la cuenta de cobro")
      const result = await submitControlledDocument("fiscalDebit", { adjustmentId: draft.id, expectedRevision: draft.revision, expectedPolicyVersion: command.expectedPolicyVersion, ...(command.payment.type === "CONTADO" ? { payment: { method, treasuryAccountId: treasuryId } } : {}) }, actor)
      if (!result || result.pending) { setMessage(result?.error ?? "Cargo pendiente de sincronización; no lo registres nuevamente."); return }
      if (!result.result.documentId) throw new Error("Consulta el historial antes de registrar otra nota")
      router.push(`/invoices/fiscal/${result.result.documentId}`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function discard() {
    if (!draft) return
    setBusy(true); setError("")
    try {
      if ((await cashPending()).some(item => item.cashOperation.accountId === actor.accountId && item.cashOperation.userId === actor.id && item.payload.adjustmentId === draft.id)) throw new Error("Resuelve primero la operación pendiente de caja")
      const storage = discardKey(draft.id), prior = localStorage.getItem(storage)
      const payload = prior ? JSON.parse(prior) : { operationId: crypto.randomUUID(), expectedRevision: draft.revision, reason: "Descartado por el usuario" }
      localStorage.setItem(storage, JSON.stringify(payload)); await request(`/api/debit-notes/${encodeURIComponent(draft.id)}/discard`, "POST", payload); localStorage.removeItem(storage)
      setDraft({ ...draft, state: "DESCARTADO" }); setMessage("Borrador descartado."); await loadList()
    } catch (e) { const status = (e as Error & { status?: number }).status; if (status && status >= 400 && status < 500) localStorage.removeItem(discardKey(draft.id)); setError((e as Error).message) } finally { setBusy(false) }
  }
  async function sync() { setBusy(true); setError(""); try { await syncCashOutbox(); if (draft) { const result: Draft = await request(`/api/debit-notes/${encodeURIComponent(draft.id)}`); setDraft(result); if (result.fiscalDocumentId) router.push(`/invoices/fiscal/${result.fiscalDocumentId}`) } await loadList() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  function restorePending() {
    try {
      const pending = JSON.parse(localStorage.getItem(key) ?? "null") as { note?: Command } | null
      if (!pending?.note) throw new Error("No se encontró el guardado pendiente")
      setCommand(pending.note); setPreview(null); setMessage("Previsualiza el guardado pendiente para recuperarlo.")
    } catch (e) { setError((e as Error).message) }
  }
  function cancelEdit() {
    if (!draft) return
    // Si se perdió la respuesta no se puede descartar el comando hasta recuperar su resultado.
    if (localStorage.getItem(key)) { setError("Recupera primero el guardado pendiente."); return }
    setCommand(draft.input); setPreview({ calculated: draft.snapshot as Preview["calculated"] }); setEditing(false); setError("")
  }
  return <main className="grid gap-4"><div><h1 className="text-2xl font-semibold">Notas de débito E33</h1><p>Documento de prueba / No emitido fiscalmente</p></div>
    {editing && <section className="grid gap-3 rounded border p-4"><label>ID del documento original<input className={field} value={command.originalDocumentId} disabled={!!draft} onChange={e => change({ ...command, originalDocumentId: e.target.value })}/></label><label>Fecha<input className={field} type="date" value={command.issueDate ?? ""} onChange={e => change({ ...command, issueDate: e.target.value })}/></label><label>Motivo<input className={field} value={command.reason} onChange={e => change({ ...command, reason: e.target.value })}/></label><label>Forma de pago<select className={field} value={command.payment.type} onChange={e => change({ ...command, payment: e.target.value === "CREDITO" ? { type: "CREDITO", dueDate: "" } : { type: "CONTADO" } })}><option value="CONTADO">Cobro inmediato</option><option value="CREDITO">A crédito</option></select></label>{command.payment.type === "CREDITO" && <label>Vencimiento<input className={field} type="date" value={command.payment.dueDate ?? ""} onChange={e => change({ ...command, payment: { type: "CREDITO", dueDate: e.target.value } })}/></label>}
      {command.lines.map((item, index) => <fieldset className="grid gap-2 rounded border p-3 md:grid-cols-3" key={index}><legend>Concepto {index + 1}</legend><label>Descripción<input className={field} value={item.description} onChange={e => line(index, { description: e.target.value })}/></label><label>Clase<select className={field} value={item.kind} onChange={e => line(index, { kind: e.target.value as Line["kind"] })}><option value="SERVICIO">Servicio</option><option value="RECARGO">Recargo</option></select></label><label>Unidad<input className={field} value={item.unit} onChange={e => line(index, { unit: e.target.value })}/></label><label>Cantidad<input className={field} value={item.quantity} onChange={e => line(index, { quantity: e.target.value })}/></label><label>Precio<input className={field} value={item.unitPrice} onChange={e => line(index, { unitPrice: e.target.value })}/></label><label>Tratamiento<select className={field} value={item.taxTreatment} onChange={e => line(index, { taxTreatment: e.target.value })}><option value="GRAVADO_18">ITBIS 18 %</option><option value="GRAVADO_16">ITBIS 16 %</option><option value="EXENTO">Exento</option><option value="TASA_CERO">Tasa cero</option></select></label><label><input type="checkbox" checked={item.priceIncludesTax} onChange={e => line(index, { priceIncludesTax: e.target.checked })}/> Precio incluye ITBIS</label><button type="button" onClick={() => change({ ...command, lines: command.lines.filter((_, i) => i !== index) })}>Quitar concepto</button></fieldset>)}
      <button className="rounded border p-2" onClick={() => change({ ...command, lines: [...command.lines, newLine()] })}>Añadir concepto</button><div className="flex gap-2"><button className="rounded border p-2" disabled={busy} onClick={() => void review()}>Previsualizar</button><button className="rounded border p-2" disabled={busy || !preview} onClick={() => void saveAndValidate()}>Guardar y validar</button>{hasPendingSave && <button className="rounded border p-2" disabled={busy} onClick={restorePending}>Restaurar guardado pendiente</button>}{draft && <button className="rounded border p-2" disabled={busy} onClick={cancelEdit}>Cancelar edición</button>}</div></section>}
    {preview && <section className="rounded border p-3"><p>Comprador: {preview.calculated.buyer?.name ?? "Consumidor general"}</p><p>Cargo: {formatRD(Math.round(Number(preview.calculated.totals.gross) * 100))} · ITBIS: {formatRD(Math.round(Number(preview.calculated.totals.tax) * 100))}</p>{preview.calculated.warnings.map(warning => <p key={warning}>{warning}</p>)}</section>}
    {draft && <section className="grid gap-2 rounded border p-4"><p>Estado: {draft.state} · Revisión {draft.revision}</p>{draft.state === "BORRADOR" && !editing && <button className="rounded border p-2" onClick={() => void validateExisting()}>Validar borrador</button>}{!editing && ["BORRADOR", "VALIDADO"].includes(draft.state) && <><button className="rounded border p-2" onClick={() => { setEditing(true); setPreview(null) }}>Editar</button><button className="rounded border p-2" onClick={() => void discard()} disabled={busy}>Descartar</button></>}{draft.state === "VALIDADO" && !editing && <>{command.payment.type === "CONTADO" && <><label>Método<select className={field} value={method} onChange={e => setMethod(e.target.value)}><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="TRANSFERENCIA">Transferencia</option><option value="OTRO">Otro</option></select></label><label>Cuenta<select className={field} value={treasuryId} onChange={e => setTreasuryId(e.target.value)}><option value="">Seleccionar</option>{treasuryAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></>}<button className="rounded border p-2" disabled={busy} onClick={() => void confirm()}>Confirmar cargo</button><button className="rounded border p-2" disabled={busy} onClick={() => void sync()}>Consultar y sincronizar</button></>}{/* La copia propia es accesible al preparador aunque no tenga acceso a toda la bandeja fiscal. */}{draft.fiscalDocumentId && <Link href={`/invoices/fiscal/${draft.fiscalDocumentId}`} className="underline">Ver documento</Link>}</section>}
    {error && <p className="text-red-600" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section className="grid gap-2"><h2 className="font-semibold">Notas registradas</h2>{notes.map(note => <Link className="underline" key={note.id} href={`/fiscal/debit-notes?noteId=${encodeURIComponent(note.id)}`}>{note.id} · {note.state}</Link>)}{nextSkip !== null && <button className="w-fit rounded border p-2" disabled={busy} onClick={() => void loadList(nextSkip).catch((e: Error) => setError(e.message))}>Cargar más notas</button>}</section>
    <Link href="/fiscal/documents" className="underline">Bandeja fiscal</Link>
  </main>
}
